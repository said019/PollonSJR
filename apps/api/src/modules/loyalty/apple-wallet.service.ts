import { FastifyInstance } from "fastify";
import { PKPass } from "passkit-generator";
import http2 from "http2";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";

// __dirname is available in CommonJS (tsconfig module: CommonJS)
const ASSETS_DIR = path.join(__dirname, "pass-assets");

export class AppleWalletService {
  constructor(private app: FastifyInstance) {}

  private async sendApnsRequest(
    pushToken: string,
    payload: object,
    pushType: "background" | "alert",
    priority: "5" | "10"
  ): Promise<void> {
    const keyId = process.env.APPLE_KEY_ID;
    const teamId = process.env.APPLE_TEAM_ID;
    const apnsKeyB64 = process.env.APPLE_APNS_KEY_BASE64;

    if (!keyId || !teamId || !apnsKeyB64) {
      this.app.log.warn(
        `APNs ${pushType} push skipped: missing APPLE_KEY_ID, APPLE_TEAM_ID, or APPLE_APNS_KEY_BASE64`
      );
      return;
    }

    const apnsKey = Buffer.from(apnsKeyB64, "base64").toString("utf-8");
    const token = jwt.sign({}, apnsKey, {
      algorithm: "ES256",
      issuer: teamId,
      keyid: keyId,
      expiresIn: "1h",
    });

    const passTypeId =
      process.env.APPLE_PASS_TYPE_ID ?? "pass.com.pollon.loyalty";
    const body = JSON.stringify(payload);

    await new Promise<void>((resolve, reject) => {
      const client = http2.connect("https://api.push.apple.com");
      let settled = false;

      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        client.close();
        if (err) reject(err);
        else resolve();
      };

      client.on("error", (err) => finish(err));

      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${pushToken}`,
        authorization: `bearer ${token}`,
        "apns-push-type": pushType,
        "apns-topic": passTypeId,
        "apns-priority": priority,
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      });

      let statusCode = 0;
      let responseBody = "";

      req.setEncoding("utf8");
      req.on("response", (headers) => {
        const rawStatus = headers[":status"];
        statusCode = Array.isArray(rawStatus)
          ? Number(rawStatus[0])
          : Number(rawStatus ?? 0);
      });
      req.on("data", (chunk) => {
        responseBody += chunk;
      });
      req.on("error", (err) => finish(err));
      req.on("end", () => {
        if (statusCode === 410) {
          this.app.prisma.appleDevice
            .deleteMany({ where: { pushToken } })
            .catch(() => {});
        }

        if (statusCode >= 400) {
          finish(
            new Error(
              `APNs ${pushType} push failed (${statusCode}): ${responseBody}`
            )
          );
          return;
        }

        finish();
      });

      req.end(body);
    });
  }

  /**
   * Generates a .pkpass buffer for a given customer.
   */
  async generatePassBuffer(customerId: string): Promise<Buffer> {
    const certB64 = process.env.APPLE_CERT_BASE64;
    const keyB64 = process.env.APPLE_KEY_BASE64;
    const wwdrB64 = process.env.APPLE_WWDR_BASE64;
    const passTypeId = process.env.APPLE_PASS_TYPE_ID;
    const teamId = process.env.APPLE_TEAM_ID;

    if (!certB64 || !keyB64 || !wwdrB64 || !passTypeId || !teamId) {
      throw new Error(
        "Apple Wallet not configured. Set APPLE_CERT_BASE64, APPLE_KEY_BASE64, APPLE_WWDR_BASE64, APPLE_PASS_TYPE_ID, APPLE_TEAM_ID"
      );
    }

    // Fetch customer info
    const customer = await this.app.prisma.customer.findUnique({
      where: { id: customerId },
      include: { loyalty: true },
    });

    const customerName = customer?.name ?? "Cliente";
    const customerPhone = customer?.phone ?? "";
    const completedOrders = customer?.loyalty?.completedOrders ?? 0;
    const pendingReward = customer?.loyalty?.pendingReward ?? false;
    const stamps = pendingReward ? 5 : completedOrders % 5;
    let lastUpdateMessage = pendingReward
      ? "¡Felicidades! Ganaste un producto gratis"
      : `Compra registrada — ${stamps}/5`;

    try {
      const storedMessage = await this.app.redis.get(
        `apple_pass_message:${customerId}`
      );
      if (storedMessage) lastUpdateMessage = storedMessage;
    } catch (err) {
      this.app.log.warn(
        { err, customerId },
        "Apple Wallet: failed to read last pass message"
      );
    }

    const apiUrl = process.env.API_URL ?? "https://api.pollon.mx";
    const authToken = process.env.APPLE_AUTH_TOKEN ?? "changeme";

    // ── Load brand assets ─────────────────────────────────────
    const readAsset = (name: string): Buffer | undefined => {
      const p = path.join(ASSETS_DIR, name);
      return fs.existsSync(p) ? fs.readFileSync(p) : undefined;
    };

    const signerCert = Buffer.from(certB64, "base64").toString("utf-8");
    const signerKey = Buffer.from(keyB64, "base64").toString("utf-8");
    const wwdr = Buffer.from(wwdrB64, "base64").toString("utf-8");

    const pass = new PKPass(
      {},
      {
        signerCert,
        signerKey,
        wwdr,
        signerKeyPassphrase: process.env.APPLE_PASS_PHRASE,
      },
      {
        formatVersion: 1,
        passTypeIdentifier: passTypeId,
        teamIdentifier: teamId,
        organizationName: "Pollón SJR",
        description: "Tarjeta de Lealtad Club Pollón",
        serialNumber: customerId,
        webServiceURL: `${apiUrl}/api/loyalty/`,
        authenticationToken: authToken,
        // Match the dark slate from the Pollón logo/strip
        backgroundColor: "rgb(45, 48, 57)",
        foregroundColor: "rgb(255, 255, 255)",
        labelColor: "rgb(232, 56, 79)",
      }
    );

    pass.type = "storeCard";

    // ── Fields ───────────────────────────────────────────────
    // headerField omitted — title is embedded in logo.png with brand typography

    pass.secondaryFields.push(
      {
        key: "progress",
        label: "AVANCE",
        value: pendingReward ? "¡Premio!" : `${stamps} de 5`,
      },
      {
        key: "type",
        label: "PROGRAMA",
        value: "Lealtad",
      }
    );

    pass.auxiliaryFields.push(
      {
        key: "phone",
        label: "TELÉFONO",
        value: customerPhone,
      },
      {
        key: "reward",
        label: "PRÓXIMO PREMIO",
        value: "Producto gratis",
      }
    );

    pass.backFields.push(
      {
        key: "last_update",
        label: "Última actualización",
        value: lastUpdateMessage,
        changeMessage: "%@",
      },
      {
        key: "how_it_works",
        label: "¿Cómo funciona?",
        value: "Cada pedido entregado suma 1 compra. Al llegar a 5 compras recibes un producto gratis de tu elección. La recompensa tiene vigencia de 6 meses.",
      },
      {
        key: "contact",
        label: "Contacto",
        value: "San Juan del Río, Querétaro",
      }
    );

    // ── Strip images (progress visual) ──────────────────────
    const stripKey = `strip-${stamps}`;
    const strip1x = readAsset(`${stripKey}.png`);
    const strip2x = readAsset(`${stripKey}@2x.png`);
    if (strip1x) pass.addBuffer("strip.png", strip1x);
    if (strip2x) pass.addBuffer("strip@2x.png", strip2x);

    // ── Logo ─────────────────────────────────────────────────
    const logo1x = readAsset("logo.png");
    const logo2x = readAsset("logo@2x.png");
    if (logo1x) pass.addBuffer("logo.png", logo1x);
    if (logo2x) pass.addBuffer("logo@2x.png", logo2x);

    // ── Icon ─────────────────────────────────────────────────
    const icon1x = readAsset("icon.png");
    const icon2x = readAsset("icon@2x.png");
    if (icon1x) pass.addBuffer("icon.png", icon1x);
    if (icon2x) pass.addBuffer("icon@2x.png", icon2x);

    // ── Location ─────────────────────────────────────────────
    const lat = process.env.BUSINESS_LATITUDE
      ? parseFloat(process.env.BUSINESS_LATITUDE)
      : null;
    const lng = process.env.BUSINESS_LONGITUDE
      ? parseFloat(process.env.BUSINESS_LONGITUDE)
      : null;

    if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
      pass.setLocations({ latitude: lat, longitude: lng });
    }

    // ── QR barcode ───────────────────────────────────────────
    pass.setBarcodes({
      message: customerId,
      format: "PKBarcodeFormatQR",
      messageEncoding: "iso-8859-1",
      altText: `ID: ${customerId.slice(0, 8)}`,
    });

    return pass.getAsBuffer();
  }

  /**
   * Sends an APNs background push notification to the device.
   * On HTTP 410 (device no longer valid), removes the device record.
   */
  async sendWalletPush(pushToken: string): Promise<void> {
    await this.sendApnsRequest(pushToken, {}, "background", "5");
  }

  /**
   * Sends a VISIBLE alert push notification to the device (not background).
   * Uses apns-push-type: "alert" and priority 10.
   */
  async sendAlertNotification(
    pushToken: string,
    title: string,
    body: string
  ): Promise<void> {
    await this.sendApnsRequest(
      pushToken,
      {
        aps: {
          alert: { title, body },
          sound: "default",
        },
      },
      "alert",
      "10"
    );
  }

  /**
   * Called after a loyalty update — logs an update record and pushes to all
   * registered devices for the given serial number (= customerId).
   */
  async updatePassAndNotify(
    customerId: string,
    message?: string
  ): Promise<void> {
    if (message) {
      try {
        await this.app.redis.set(`apple_pass_message:${customerId}`, message, {
          EX: 60 * 60 * 24 * 14,
        });
      } catch (err) {
        this.app.log.warn(
          { err, customerId },
          "Apple Wallet: failed to store pass update message"
        );
      }
    }

    const devices = await this.app.prisma.appleDevice.findMany({
      where: { serialNumber: customerId },
    });

    // Record that this serial has been updated
    await this.app.prisma.appleUpdate.create({
      data: { serialNumber: customerId },
    });

    if (devices.length === 0) {
      this.app.log.info(
        { customerId },
        "Apple Wallet pass update recorded with no registered devices"
      );
      return;
    }

    // Push to each device
    const results = await Promise.allSettled(
      devices.map(async (d) => {
        // Apple Wallet notifications are triggered by the refreshed pass field
        // changeMessage, so the APNs payload only wakes Wallet to fetch it.
        await this.sendWalletPush(d.pushToken);
      })
    );

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        this.app.log.error(
          {
            err: result.reason,
            customerId,
            deviceId: devices[index]?.deviceId,
          },
          "Apple Wallet push failed"
        );
      }
    });
  }
}
