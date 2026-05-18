-- CreateTable
CREATE TABLE "xhs_comment" (
    "id" BIGSERIAL NOT NULL,
    "team_id" BIGINT NOT NULL,
    "account_id" BIGINT NOT NULL,
    "note_url" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "author_name" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "liked_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'new',
    "reply" TEXT,
    "replied_at" TIMESTAMP(3),
    "rule_id" BIGINT,

    CONSTRAINT "xhs_comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comment_rule" (
    "id" BIGSERIAL NOT NULL,
    "team_id" BIGINT NOT NULL,
    "account_id" BIGINT,
    "name" TEXT NOT NULL,
    "triggers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reply_mode" TEXT NOT NULL DEFAULT 'template',
    "template" TEXT,
    "ai_persona" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comment_rule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "xhs_comment_comment_id_key" ON "xhs_comment"("comment_id");

-- CreateIndex
CREATE INDEX "xhs_comment_team_id_status_fetched_at_idx" ON "xhs_comment"("team_id", "status", "fetched_at");

-- CreateIndex
CREATE INDEX "xhs_comment_account_id_status_idx" ON "xhs_comment"("account_id", "status");

-- CreateIndex
CREATE INDEX "comment_rule_team_id_enabled_priority_idx" ON "comment_rule"("team_id", "enabled", "priority");
