-- Append-only log of successful automation.publish actions. Replaces the
-- audit_log JSON-path count used by AutomationService.assertQuota.

CREATE TABLE "publish_log" (
  "id" BIGSERIAL NOT NULL,
  "account_id" BIGINT NOT NULL,
  "draft_id" BIGINT,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "publish_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "publish_log_account_id_published_at_idx"
  ON "publish_log" ("account_id", "published_at" DESC);
