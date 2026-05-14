-- CreateTable
CREATE TABLE "app_user" (
    "id" BIGSERIAL NOT NULL,
    "openid" TEXT NOT NULL,
    "unionid" TEXT,
    "phone" TEXT,
    "nickname" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "owner_id" BIGINT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "seats" INTEGER NOT NULL DEFAULT 1,
    "current_period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_member" (
    "team_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "role" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_member_pkey" PRIMARY KEY ("team_id","user_id")
);

-- CreateTable
CREATE TABLE "xhs_account" (
    "id" BIGSERIAL NOT NULL,
    "team_id" BIGINT NOT NULL,
    "nickname" TEXT NOT NULL,
    "xhs_url" TEXT,
    "vertical" TEXT,
    "persona" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xhs_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft" (
    "id" BIGSERIAL NOT NULL,
    "team_id" BIGINT NOT NULL,
    "account_id" BIGINT,
    "author_id" BIGINT,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "media" JSONB NOT NULL DEFAULT '[]',
    "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "schedule_at" TIMESTAMP(3),
    "handed_off_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "published_url" TEXT,
    "ai_meta" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_review" (
    "id" BIGSERIAL NOT NULL,
    "draft_id" BIGINT NOT NULL,
    "reviewer_id" BIGINT,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspire_note" (
    "id" BIGSERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "vertical" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "inspire_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspire_pool" (
    "id" BIGSERIAL NOT NULL,
    "team_id" BIGINT NOT NULL,
    "user_id" BIGINT,
    "note_fp" TEXT NOT NULL,
    "note_snapshot" JSONB NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspire_pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lint_word" (
    "id" BIGSERIAL NOT NULL,
    "term" TEXT NOT NULL,
    "pattern_type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "suggestion" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lint_word_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_point" (
    "id" BIGSERIAL NOT NULL,
    "team_id" BIGINT NOT NULL,
    "account_id" BIGINT,
    "draft_id" BIGINT,
    "bucket_date" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" BIGSERIAL NOT NULL,
    "team_id" BIGINT,
    "user_id" BIGINT,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "cached_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscribe_token" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "template_id" TEXT NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_for" JSONB,

    CONSTRAINT "subscribe_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "team_id" BIGINT,
    "actor_id" BIGINT,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" BIGINT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_openid_key" ON "app_user"("openid");

-- CreateIndex
CREATE INDEX "xhs_account_team_id_idx" ON "xhs_account"("team_id");

-- CreateIndex
CREATE INDEX "draft_team_id_status_idx" ON "draft"("team_id", "status");

-- CreateIndex
CREATE INDEX "draft_account_id_idx" ON "draft"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "inspire_note_fingerprint_key" ON "inspire_note"("fingerprint");

-- CreateIndex
CREATE INDEX "inspire_note_vertical_idx" ON "inspire_note"("vertical");

-- CreateIndex
CREATE INDEX "lint_word_enabled_idx" ON "lint_word"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "lint_word_term_pattern_type_key" ON "lint_word"("term", "pattern_type");

-- CreateIndex
CREATE INDEX "data_point_team_id_bucket_date_idx" ON "data_point"("team_id", "bucket_date");

-- CreateIndex
CREATE UNIQUE INDEX "data_point_account_id_bucket_date_source_key" ON "data_point"("account_id", "bucket_date", "source");

-- CreateIndex
CREATE INDEX "ai_usage_team_id_created_at_idx" ON "ai_usage"("team_id", "created_at");

-- CreateIndex
CREATE INDEX "subscribe_token_user_id_template_id_idx" ON "subscribe_token"("user_id", "template_id");

-- CreateIndex
CREATE INDEX "audit_log_team_id_created_at_idx" ON "audit_log"("team_id", "created_at");

-- AddForeignKey
ALTER TABLE "team" ADD CONSTRAINT "team_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xhs_account" ADD CONSTRAINT "xhs_account_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft" ADD CONSTRAINT "draft_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft" ADD CONSTRAINT "draft_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "xhs_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft" ADD CONSTRAINT "draft_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_review" ADD CONSTRAINT "draft_review_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_review" ADD CONSTRAINT "draft_review_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspire_pool" ADD CONSTRAINT "inspire_pool_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspire_pool" ADD CONSTRAINT "inspire_pool_note_fp_fkey" FOREIGN KEY ("note_fp") REFERENCES "inspire_note"("fingerprint") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_point" ADD CONSTRAINT "data_point_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_point" ADD CONSTRAINT "data_point_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "xhs_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_point" ADD CONSTRAINT "data_point_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "draft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscribe_token" ADD CONSTRAINT "subscribe_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
