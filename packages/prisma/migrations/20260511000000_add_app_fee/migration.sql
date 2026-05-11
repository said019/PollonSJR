-- Order: 4% "Uso de aplicación" surcharge on CARD payments
ALTER TABLE "Order" ADD COLUMN "appFeeAmount" INTEGER NOT NULL DEFAULT 0;
