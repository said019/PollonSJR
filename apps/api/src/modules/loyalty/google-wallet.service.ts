import { FastifyInstance } from "fastify";

export class GoogleWalletService {
  constructor(private app: FastifyInstance) {}

  // Placeholder for Google Wallet JWT generation
  async generatePass(customerId: string) {
    // Implementation requires:
    // - GOOGLE_ISSUER_ID
    // - GOOGLE_SA_JSON (Service Account)
    // Use google-auth-library + custom JWT signing
    throw new Error("Google Wallet implementation pending");
  }
}
