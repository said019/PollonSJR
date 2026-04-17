import { FastifyInstance } from "fastify";
import { PKPass } from "passkit-generator";
import https from "https";
import jwt from "jsonwebtoken";

export class AppleWalletService {
  constructor(private app: FastifyInstance) {}

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

    const apiUrl = process.env.API_URL ?? "https://api.pollon.mx";
    const authToken = process.env.APPLE_AUTH_TOKEN ?? "changeme";

    const pass = new PKPass(
      {},
      {
        signerCert: Buffer.from(certB64, "base64"),
        signerKey: Buffer.from(keyB64, "base64"),
        wwdr: Buffer.from(wwdrB64, "base64"),
        signerKeyPassphrase: process.env.APPLE_PASS_PHRASE,
      },
      {
        formatVersion: 1,
        passTypeIdentifier: passTypeId,
        teamIdentifier: teamId,
        organizationName: "Pollón SJR",
        description: "Tarjeta de Lealtad",
        serialNumber: customerId,
        webServiceURL: `${apiUrl}/`,
        authenticationToken: authToken,
        backgroundColor: "rgb(249, 115, 22)",
        foregroundColor: "rgb(255, 255, 255)",
        labelColor: "rgb(255, 255, 255)",
      }
    );

    pass.type = "storeCard";

    pass.primaryFields.push({
      key: "name",
      label: "TITULAR",
      value: customerName,
    });

    pass.secondaryFields.push(
      { key: "progress", label: "COMPRAS", value: `${stamps}/5` },
      { key: "type", label: "PROGRAMA", value: "Club Pollón" }
    );

    pass.auxiliaryFields.push({
      key: "phone",
      label: "TELÉFONO",
      value: customerPhone,
    });

    // Location
    const lat = process.env.BUSINESS_LATITUDE
      ? parseFloat(process.env.BUSINESS_LATITUDE)
      : null;
    const lng = process.env.BUSINESS_LONGITUDE
      ? parseFloat(process.env.BUSINESS_LONGITUDE)
      : null;

    if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
      pass.setLocations({ latitude: lat, longitude: lng });
    }

    pass.setBarcodes({
      message: customerId,
      format: "PKBarcodeFormatQR",
      messageEncoding: "iso-8859-1",
    });

    return pass.getAsBuffer();
  }

  /**
   * Sends an APNs background push notification to the device.
   * On HTTP 410 (device no longer valid), removes the device record.
   */
  async sendWalletPush(pushToken: string): Promise<void> {
    const keyId = process.env.APPLE_KEY_ID;
    const teamId = process.env.APPLE_TEAM_ID;
    const apnsKeyB64 = process.env.APPLE_APNS_KEY_BASE64;

    if (!keyId || !teamId || !apnsKeyB64) {
      this.app.log.warn(
        "APNs push skipped: missing APPLE_KEY_ID, APPLE_TEAM_ID, or APPLE_APNS_KEY_BASE64"
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
    const host = "api.push.apple.com";
    const path = `/3/device/${pushToken}`;

    await new Promise<void>((resolve, reject) => {
      const body = JSON.stringify({});
      const options: https.RequestOptions = {
        hostname: host,
        port: 443,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          authorization: `bearer ${token}`,
          "apns-push-type": "background",
          "apns-topic": `${passTypeId}.voip`,
          "apns-priority": "5",
        },
      };

      const req = https.request(options, (res) => {
        if (res.statusCode === 410) {
          // Device is no longer registered — clean up async
          this.app.prisma.appleDevice
            .deleteMany({ where: { pushToken } })
            .catch(() => {});
        }
        res.resume();
        resolve();
      });

      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Called after a loyalty update — logs an update record and pushes to all
   * registered devices for the given serial number (= customerId).
   */
  async updatePassAndNotify(customerId: string): Promise<void> {
    const devices = await this.app.prisma.appleDevice.findMany({
      where: { serialNumber: customerId },
    });

    // Record that this serial has been updated
    await this.app.prisma.appleUpdate.create({
      data: { serialNumber: customerId },
    });

    // Push to each device
    await Promise.allSettled(
      devices.map((d) => this.sendWalletPush(d.pushToken))
    );
  }
}
