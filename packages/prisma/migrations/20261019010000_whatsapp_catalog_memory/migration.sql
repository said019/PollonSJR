CREATE TABLE "WhatsAppCatalogLink" (
  "sellerPhone" TEXT NOT NULL, "externalId" TEXT NOT NULL,
  "productId" TEXT NOT NULL, "variant" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppCatalogLink_pkey" PRIMARY KEY ("sellerPhone", "externalId"),
  CONSTRAINT "WhatsAppCatalogLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "WhatsAppPreference" (
  "phone" TEXT NOT NULL PRIMARY KEY, "note" TEXT, "basket" JSONB,
  "consentAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
