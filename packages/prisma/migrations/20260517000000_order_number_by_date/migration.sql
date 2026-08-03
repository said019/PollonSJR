-- orderNumber pasa a ser un número visible por fecha (DDMMNNN),
-- generado en código. Deja de ser @unique y autoincrement: nunca se
-- busca por él (solo se muestra); las búsquedas son por id. El choque
-- entre años (mismo día/mes) es aceptable porque no es llave.

DROP INDEX IF EXISTS "Order_orderNumber_key";

ALTER TABLE "Order" ALTER COLUMN "orderNumber" DROP DEFAULT;

-- Contador atómico por día (zona México). El INSERT ... ON CONFLICT
-- DO UPDATE seq+1 garantiza secuencia sin choques aun con pedidos
-- simultáneos.
CREATE TABLE "OrderCounter" (
    "dateKey" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "OrderCounter_pkey" PRIMARY KEY ("dateKey")
);
