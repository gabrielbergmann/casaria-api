-- Specs 017 (Pix direto) e 018 (quantidade nos presentes de preço fixo).

-- CreateEnum
CREATE TYPE "pix_key_type" AS ENUM ('CPF', 'CNPJ', 'PHONE', 'EMAIL', 'RANDOM');

-- AlterEnum
ALTER TYPE "payment_method" ADD VALUE 'PIX_DIRECT';

-- AlterEnum
ALTER TYPE "order_status" ADD VALUE 'AWAITING_CONFIRMATION';

-- AlterTable
ALTER TABLE "gifts" ADD COLUMN     "hide_when_sold_out" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "pix_keys" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wedding_id" UUID NOT NULL,
    "key_type" "pix_key_type" NOT NULL,
    "key" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pix_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pix_keys_wedding_id_key" ON "pix_keys"("wedding_id");

-- AddForeignKey
ALTER TABLE "pix_keys" ADD CONSTRAINT "pix_keys_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Spec 018: preço fixo pode ter quantidade (quota_total), nula = sem limite.
ALTER TABLE "gifts" DROP CONSTRAINT "gifts_type_fields_check";
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_type_fields_check" CHECK (
  (type = 'VIRTUAL' AND price_cents > 0 AND quota_price_cents IS NULL
    AND (quota_total IS NULL OR quota_total > 0))
  OR (type = 'QUOTA' AND price_cents IS NULL AND quota_price_cents > 0 AND quota_total > 0)
  OR (type = 'FREE_AMOUNT' AND price_cents IS NULL AND quota_price_cents IS NULL
      AND quota_total IS NULL));
