import { FastifyInstance } from "fastify";
import https from "https";
import jwt from "jsonwebtoken";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export class GoogleWalletService {
  constructor(private app: FastifyInstance) {}

  // ─── Private helpers ───────────────────────────────────────

  private loadServiceAccount(): ServiceAccount | null {
    const email = process.env.GOOGLE_SA_EMAIL;
    const rawKey = process.env.GOOGLE_SA_PRIVATE_KEY;

    if (email && rawKey) {
      return {
        client_email: email,
        private_key: rawKey.replace(/\\n/g, "\n"),
      };
    }

    const saJsonPath = process.env.GOOGLE_SA_JSON;
    if (saJsonPath) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require("fs") as typeof import("fs");
        const content = fs.readFileSync(saJsonPath, "utf-8");
        return JSON.parse(content) as ServiceAccount;
      } catch {
        return null;
      }
    }

    return null;
  }

  private safeId(customerId: string): string {
    return customerId.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  /** Get an OAuth2 access token using JWT assertion. */
  private async getAccessToken(sa: ServiceAccount): Promise<string> {
    const scope = "https://www.googleapis.com/auth/wallet_object.issuer";
    const now = Math.floor(Date.now() / 1000);

    const assertion = jwt.sign(
      {
        iss: sa.client_email,
        scope,
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      },
      sa.private_key,
      { algorithm: "RS256" }
    );

    return new Promise<string>((resolve, reject) => {
      const body = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString();

      const options: https.RequestOptions = {
        hostname: "oauth2.googleapis.com",
        port: 443,
        path: "/token",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data) as { access_token?: string };
            if (parsed.access_token) {
              resolve(parsed.access_token);
            } else {
              reject(new Error(`OAuth2 token error: ${data}`));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on("error", reject);
      req.write(body);
      req.end();
    });
  }

  /** Low-level HTTPS request helper */
  private async httpsRequest(
    options: https.RequestOptions,
    body: string
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () =>
          resolve({ statusCode: res.statusCode ?? 0, body: data })
        );
      });
      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });
  }

  // ─── Public API ────────────────────────────────────────────

  /**
   * Creates or updates the Google Wallet loyalty class.
   * Should be called once during setup or when class config changes.
   */
  async ensureLoyaltyClass(): Promise<void> {
    const issuerId = process.env.GOOGLE_ISSUER_ID;
    const sa = this.loadServiceAccount();
    if (!issuerId || !sa) return;

    const accessToken = await this.getAccessToken(sa);
    const classId = `${issuerId}.pollon_loyalty_v1`;
    const baseUrl = process.env.WEB_URL || "https://pollon.mx";

    const loyaltyClass = {
      id: classId,
      issuerName: "Pollón SJR",
      programName: "Club Pollón",
      programLogo: {
        sourceUri: { uri: `${baseUrl}/pollon-logo.jpg` },
        contentDescription: {
          defaultValue: { language: "es", value: "Pollón Logo" },
        },
      },
      hexBackgroundColor: "#2D3039",
      countryCode: "MX",
      reviewStatus: "UNDER_REVIEW",
      // Location for proximity notifications
      locations:
        process.env.BUSINESS_LATITUDE && process.env.BUSINESS_LONGITUDE
          ? [
              {
                latitude: parseFloat(process.env.BUSINESS_LATITUDE),
                longitude: parseFloat(process.env.BUSINESS_LONGITUDE),
              },
            ]
          : [],
    };

    // Try PUT (update), fall back to POST (create)
    const bodyStr = JSON.stringify(loyaltyClass);
    const putResult = await this.httpsRequest(
      {
        hostname: "walletobjects.googleapis.com",
        port: 443,
        path: `/walletobjects/v1/loyaltyClass/${encodeURIComponent(classId)}`,
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
          Authorization: `Bearer ${accessToken}`,
        },
      },
      bodyStr
    );

    if (putResult.statusCode === 404) {
      await this.httpsRequest(
        {
          hostname: "walletobjects.googleapis.com",
          port: 443,
          path: "/walletobjects/v1/loyaltyClass",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(bodyStr),
            Authorization: `Bearer ${accessToken}`,
          },
        },
        bodyStr
      );
    }
  }

  /**
   * Sends a visible notification (message) to a Google Wallet loyalty pass.
   */
  async sendMessage(
    customerId: string,
    title: string,
    body: string
  ): Promise<void> {
    const issuerId = process.env.GOOGLE_ISSUER_ID;
    const sa = this.loadServiceAccount();
    if (!issuerId || !sa) {
      this.app.log.warn(
        "Google Wallet message skipped: issuer or service account not configured"
      );
      return;
    }

    const accessToken = await this.getAccessToken(sa);
    const objectId = `${issuerId}.${this.safeId(customerId)}`;
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const payload = JSON.stringify({
      message: {
        header: title,
        body,
        id: msgId,
        messageType: "TEXT_AND_NOTIFY",
        displayInterval: {
          start: { date: now.toISOString() },
          end: { date: end.toISOString() },
        },
      },
    });

    const result = await this.httpsRequest(
      {
        hostname: "walletobjects.googleapis.com",
        port: 443,
        path: `/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}/addMessage`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Authorization: `Bearer ${accessToken}`,
        },
      },
      payload
    );

    if (result.statusCode >= 400) {
      throw new Error(
        `Google Wallet: failed to add message (${result.statusCode}): ${result.body}`
      );
    }
  }

  /**
   * Builds a Google Pay save URL containing a signed JWT with the loyalty
   * object embedded (no server-side object creation required).
   */
  buildSaveUrl(customerId: string, name: string, stamps: number): string {
    const issuerId = process.env.GOOGLE_ISSUER_ID;
    const sa = this.loadServiceAccount();

    if (!issuerId || !sa) {
      throw new Error(
        "Google Wallet not configured. Set GOOGLE_ISSUER_ID and GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY (or GOOGLE_SA_JSON)"
      );
    }

    const objectId = `${issuerId}.${this.safeId(customerId)}`;
    const classId = `${issuerId}.pollon_loyalty_v1`;

    const loyaltyObject = {
      id: objectId,
      classId,
      state: "ACTIVE",
      loyaltyPoints: {
        balance: { int: stamps },
        label: "COMPRAS",
      },
      secondaryLoyaltyPoints: {
        balance: { string: `${stamps}/5` },
        label: "Progreso",
      },
      barcode: {
        type: "QR_CODE",
        value: customerId,
        alternateText: customerId,
      },
      textModulesData: [
        { header: "Titular", body: name },
        { header: "Programa", body: "Club Pollón" },
      ],
    };

    const payload = {
      iss: sa.client_email,
      aud: "google",
      typ: "savetowallet",
      iat: Math.floor(Date.now() / 1000),
      payload: {
        loyaltyObjects: [loyaltyObject],
      },
    };

    const token = jwt.sign(payload, sa.private_key, { algorithm: "RS256" });
    return `https://pay.google.com/gp/v/save/${token}`;
  }

  /**
   * Updates an existing Google Wallet loyalty object via the REST API.
   * Creates one if it doesn't exist yet.
   * Logs and skips when Google Wallet credentials are not configured.
   */
  async updateLoyaltyObject(
    customerId: string,
    name: string,
    stamps: number
  ): Promise<void> {
    const issuerId = process.env.GOOGLE_ISSUER_ID;
    if (!issuerId) {
      this.app.log.warn("Google Wallet update skipped: issuer not configured");
      return;
    }

    const sa = this.loadServiceAccount();
    if (!sa) {
      this.app.log.warn(
        "Google Wallet update skipped: service account not configured"
      );
      return;
    }

    let accessToken: string;
    try {
      accessToken = await this.getAccessToken(sa);
    } catch (err) {
      this.app.log.error({ err }, "Google Wallet: failed to get access token");
      return;
    }

    const objectId = `${issuerId}.${this.safeId(customerId)}`;
    const classId = `${issuerId}.pollon_loyalty_v1`;

    const loyaltyObject = {
      id: objectId,
      classId,
      state: "ACTIVE",
      loyaltyPoints: {
        balance: { int: stamps },
        label: "COMPRAS",
      },
      secondaryLoyaltyPoints: {
        balance: { string: `${stamps}/5` },
        label: "Progreso",
      },
      barcode: {
        type: "QR_CODE",
        value: customerId,
        alternateText: customerId,
      },
      textModulesData: [
        { header: "Titular", body: name },
        { header: "Programa", body: "Club Pollón" },
      ],
    };

    const bodyStr = JSON.stringify(loyaltyObject);
    const basePath = `/walletobjects/v1/loyaltyObject/${encodeURIComponent(objectId)}`;

    const putOptions: https.RequestOptions = {
      hostname: "walletobjects.googleapis.com",
      port: 443,
      path: basePath,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
        Authorization: `Bearer ${accessToken}`,
      },
    };

    const putResult = await this.httpsRequest(putOptions, bodyStr);

    if (putResult.statusCode === 404) {
      // Object doesn't exist — create it
      const postPath = `/walletobjects/v1/loyaltyObject`;
      const postOptions: https.RequestOptions = {
        hostname: "walletobjects.googleapis.com",
        port: 443,
        path: postPath,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyStr),
          Authorization: `Bearer ${accessToken}`,
        },
      };
      const postResult = await this.httpsRequest(postOptions, bodyStr);
      if (postResult.statusCode >= 400) {
        throw new Error(
          `Google Wallet: failed to create object (${postResult.statusCode}): ${postResult.body}`
        );
      }
    } else if (putResult.statusCode >= 400) {
      throw new Error(
        `Google Wallet: failed to update object (${putResult.statusCode}): ${putResult.body}`
      );
    }
  }
}
