import { MercadoPagoConfig } from "mercadopago";

export function createMPClient() {
  return new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN || "",
  });
}
