-- AlterTable: add sentiment to xhs_comment
ALTER TABLE "xhs_comment" ADD COLUMN "sentiment" TEXT;

-- CreateTable: dm_conversation
CREATE TABLE "dm_conversation" (
    "id" BIGSERIAL NOT NULL,
    "team_id" BIGINT NOT NULL,
    "account_id" BIGINT NOT NULL,
    "peer_id" TEXT NOT NULL,
    "peer_name" TEXT NOT NULL,
    "peer_avatar" TEXT,
    "last_message" TEXT,
    "last_at" TIMESTAMP(3),
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dm_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: dm_message
CREATE TABLE "dm_message" (
    "id" BIGSERIAL NOT NULL,
    "conversation_id" BIGINT NOT NULL,
    "direction" TEXT NOT NULL,
    "msg_id" TEXT,
    "content" TEXT NOT NULL,
    "msg_type" TEXT NOT NULL DEFAULT 'text',
    "sent_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dm_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable: dm_rule
CREATE TABLE "dm_rule" (
    "id" BIGSERIAL NOT NULL,
    "team_id" BIGINT NOT NULL,
    "account_id" BIGINT,
    "name" TEXT NOT NULL,
    "triggers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "replyMode" TEXT NOT NULL DEFAULT 'template',
    "template" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dm_rule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dm_conversation_account_id_peer_id_key" ON "dm_conversation"("account_id", "peer_id");
CREATE INDEX "dm_conversation_team_id_last_at_idx" ON "dm_conversation"("team_id", "last_at");

CREATE UNIQUE INDEX "dm_message_msg_id_key" ON "dm_message"("msg_id");
CREATE INDEX "dm_message_conversation_id_sent_at_idx" ON "dm_message"("conversation_id", "sent_at");

CREATE INDEX "dm_rule_team_id_enabled_priority_idx" ON "dm_rule"("team_id", "enabled", "priority");

-- AddForeignKey
ALTER TABLE "dm_message" ADD CONSTRAINT "dm_message_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "dm_conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
