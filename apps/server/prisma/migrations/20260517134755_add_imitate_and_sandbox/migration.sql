-- CreateTable
CREATE TABLE "ref_note" (
    "id" BIGSERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "images" JSONB NOT NULL DEFAULT '[]',
    "author" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ref_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "xhs_session" (
    "id" BIGSERIAL NOT NULL,
    "account_id" BIGINT NOT NULL,
    "storage_state" BYTEA,
    "user_agent" TEXT,
    "viewport" JSONB,
    "proxy_id" BIGINT,
    "fingerprint" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'needs_login',
    "login_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "daily_quota" JSONB NOT NULL DEFAULT '{"posts":3,"comments":30,"dms":50}',
    "active_window" JSONB NOT NULL DEFAULT '{"from":"09:00","to":"22:00","tz":"Asia/Shanghai"}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xhs_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proxy" (
    "id" BIGSERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "credentials" TEXT,
    "geo_city" TEXT,
    "health" TEXT NOT NULL DEFAULT 'healthy',
    "last_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proxy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" BIGSERIAL NOT NULL,
    "team_id" BIGINT NOT NULL,
    "account_id" BIGINT,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "result_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ref_note_url_key" ON "ref_note"("url");

-- CreateIndex
CREATE UNIQUE INDEX "xhs_session_account_id_key" ON "xhs_session"("account_id");

-- CreateIndex
CREATE INDEX "job_team_id_status_scheduled_at_idx" ON "job"("team_id", "status", "scheduled_at");

-- AddForeignKey
ALTER TABLE "xhs_session" ADD CONSTRAINT "xhs_session_proxy_id_fkey" FOREIGN KEY ("proxy_id") REFERENCES "proxy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
