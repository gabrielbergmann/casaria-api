-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "wedding_role" AS ENUM ('owner', 'editor');

-- CreateEnum
CREATE TYPE "guest_origin" AS ENUM ('LIST', 'COMPANION');

-- CreateEnum
CREATE TYPE "rsvp_status" AS ENUM ('CONFIRMED', 'DECLINED');

-- CreateEnum
CREATE TYPE "gift_type" AS ENUM ('VIRTUAL', 'QUOTA', 'FREE_AMOUNT');

-- CreateEnum
CREATE TYPE "guestbook_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "payment_account_status" AS ENUM ('CONNECTED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "disconnect_reason" AS ENUM ('OWNER', 'REFRESH_FAILED', 'DEAUTHORIZED');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('PIX', 'CARD');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('PENDING', 'IN_PROCESS', 'APPROVED', 'REJECTED', 'EXPIRED', 'REFUNDED', 'CHARGED_BACK');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_superadmin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "password_hash" TEXT,
    "password_reset_token_hash" TEXT,
    "password_reset_expires_at" TIMESTAMPTZ(6),
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "terms_accepted_version" TEXT,
    "terms_accepted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weddings" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "slug" TEXT NOT NULL,
    "couple_name" TEXT NOT NULL,
    "wedding_date" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "personal_data_anonymized_at" TIMESTAMPTZ(6),

    CONSTRAINT "weddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_members" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wedding_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "wedding_role" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wedding_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slug_redirects" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "old_slug" TEXT NOT NULL,
    "wedding_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slug_redirects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_invitations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wedding_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "wedding_role" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wedding_id" UUID NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_configs" (
    "wedding_id" UUID NOT NULL,
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "published_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "site_configs_pkey" PRIMARY KEY ("wedding_id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wedding_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "max_companions" INTEGER NOT NULL DEFAULT 0,
    "token" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wedding_id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_child" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "email" TEXT,
    "origin" "guest_origin" NOT NULL DEFAULT 'LIST',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_settings" (
    "wedding_id" UUID NOT NULL,
    "invite_message" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "guest_settings_pkey" PRIMARY KEY ("wedding_id")
);

-- CreateTable
CREATE TABLE "rsvp_settings" (
    "wedding_id" UUID NOT NULL,
    "open_mode_enabled" BOOLEAN NOT NULL DEFAULT false,
    "deadline" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rsvp_settings_pkey" PRIMARY KEY ("wedding_id")
);

-- CreateTable
CREATE TABLE "rsvp_responses" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wedding_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "status" "rsvp_status" NOT NULL,
    "dietary_notes" TEXT,
    "message" TEXT,
    "responded_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rsvp_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "open_rsvp_responses" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wedding_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "status" "rsvp_status" NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "open_rsvp_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_categories" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wedding_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gifts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wedding_id" UUID NOT NULL,
    "type" "gift_type" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "media_id" UUID,
    "category_id" UUID,
    "position" INTEGER NOT NULL,
    "price_cents" INTEGER,
    "quota_price_cents" INTEGER,
    "quota_total" INTEGER,
    "quotas_sold" INTEGER NOT NULL DEFAULT 0,
    "quotas_reserved" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guestbook_messages" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wedding_id" UUID NOT NULL,
    "author_name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "guestbook_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "guestbook_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_accounts" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wedding_id" UUID NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "access_token_enc" TEXT,
    "refresh_token_enc" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "status" "payment_account_status" NOT NULL,
    "disconnect_reason" "disconnect_reason",
    "connected_at" TIMESTAMPTZ(6) NOT NULL,
    "disconnected_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_fees" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wedding_id" UUID NOT NULL,
    "method" "payment_method" NOT NULL,
    "percent_bps" INTEGER NOT NULL,
    "fixed_cents" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wedding_id" UUID NOT NULL,
    "gift_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "fee_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "method" "payment_method" NOT NULL,
    "installments" INTEGER,
    "status" "order_status" NOT NULL DEFAULT 'PENDING',
    "payer_name" TEXT NOT NULL,
    "payer_email" TEXT,
    "payer_cpf_enc" TEXT,
    "message" TEXT,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "reservation_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "provider_payment_id" TEXT,
    "approved_at" TIMESTAMPTZ(6),
    "thanked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "wedding_id" UUID NOT NULL,
    "request_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "data_id" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "actor_user_id" UUID,
    "wedding_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_password_reset_token_hash_key" ON "users"("password_reset_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "weddings_slug_key" ON "weddings"("slug");

-- CreateIndex
CREATE INDEX "wedding_members_user_id_idx" ON "wedding_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wedding_members_wedding_id_user_id_key" ON "wedding_members"("wedding_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "slug_redirects_old_slug_key" ON "slug_redirects"("old_slug");

-- CreateIndex
CREATE INDEX "slug_redirects_wedding_id_idx" ON "slug_redirects"("wedding_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_invitations_token_hash_key" ON "member_invitations"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "member_invitations_wedding_id_email_key" ON "member_invitations"("wedding_id", "email");

-- CreateIndex
CREATE INDEX "media_wedding_id_id_idx" ON "media"("wedding_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_wedding_id_code_key" ON "invitations"("wedding_id", "code");

-- CreateIndex
CREATE INDEX "guests_wedding_id_invitation_id_idx" ON "guests"("wedding_id", "invitation_id");

-- CreateIndex
CREATE UNIQUE INDEX "rsvp_responses_guest_id_key" ON "rsvp_responses"("guest_id");

-- CreateIndex
CREATE INDEX "rsvp_responses_wedding_id_status_idx" ON "rsvp_responses"("wedding_id", "status");

-- CreateIndex
CREATE INDEX "open_rsvp_responses_wedding_id_id_idx" ON "open_rsvp_responses"("wedding_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gift_categories_wedding_id_name_key" ON "gift_categories"("wedding_id", "name");

-- CreateIndex
CREATE INDEX "gifts_wedding_id_position_idx" ON "gifts"("wedding_id", "position");

-- CreateIndex
CREATE INDEX "guestbook_messages_wedding_id_status_created_at_idx" ON "guestbook_messages"("wedding_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_accounts_wedding_id_key" ON "payment_accounts"("wedding_id");

-- CreateIndex
CREATE INDEX "payment_accounts_provider_user_id_idx" ON "payment_accounts"("provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_fees_wedding_id_method_key" ON "payment_fees"("wedding_id", "method");

-- CreateIndex
CREATE UNIQUE INDEX "orders_provider_payment_id_key" ON "orders"("provider_payment_id");

-- CreateIndex
CREATE INDEX "orders_wedding_id_status_idx" ON "orders"("wedding_id", "status");

-- CreateIndex
CREATE INDEX "orders_wedding_id_approved_at_idx" ON "orders"("wedding_id", "approved_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_request_id_key" ON "webhook_events"("request_id");

-- CreateIndex
CREATE INDEX "webhook_events_wedding_id_idx" ON "webhook_events"("wedding_id");

-- CreateIndex
CREATE INDEX "audit_logs_wedding_id_occurred_at_idx" ON "audit_logs"("wedding_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "wedding_members" ADD CONSTRAINT "wedding_members_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wedding_members" ADD CONSTRAINT "wedding_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slug_redirects" ADD CONSTRAINT "slug_redirects_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_invitations" ADD CONSTRAINT "member_invitations_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_configs" ADD CONSTRAINT "site_configs_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_settings" ADD CONSTRAINT "guest_settings_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp_settings" ADD CONSTRAINT "rsvp_settings_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp_responses" ADD CONSTRAINT "rsvp_responses_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp_responses" ADD CONSTRAINT "rsvp_responses_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_rsvp_responses" ADD CONSTRAINT "open_rsvp_responses_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_categories" ADD CONSTRAINT "gift_categories_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "gift_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guestbook_messages" ADD CONSTRAINT "guestbook_messages_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_fees" ADD CONSTRAINT "payment_fees_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_gift_id_fkey" FOREIGN KEY ("gift_id") REFERENCES "gifts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_wedding_id_fkey" FOREIGN KEY ("wedding_id") REFERENCES "weddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SQL manual (spec 011): CHECKs de gifts que o Prisma não expressa. Campos de valor por tipo e
-- contadores de cota nunca negativos nem acima do total.
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_type_fields_check" CHECK (
  ("type" = 'VIRTUAL' AND "price_cents" > 0 AND "quota_price_cents" IS NULL AND "quota_total" IS NULL)
  OR ("type" = 'QUOTA' AND "price_cents" IS NULL AND "quota_price_cents" > 0 AND "quota_total" > 0)
  OR ("type" = 'FREE_AMOUNT' AND "price_cents" IS NULL AND "quota_price_cents" IS NULL AND "quota_total" IS NULL));

ALTER TABLE "gifts" ADD CONSTRAINT "gifts_quota_counters_check" CHECK (
  "quotas_sold" >= 0 AND "quotas_reserved" >= 0
  AND "quotas_sold" + "quotas_reserved" <= COALESCE("quota_total", 0));
