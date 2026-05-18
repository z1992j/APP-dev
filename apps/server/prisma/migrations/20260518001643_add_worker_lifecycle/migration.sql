-- AlterTable
ALTER TABLE "xhs_session" ADD COLUMN     "qrcode_data" TEXT,
ADD COLUMN     "qrcode_issued_at" TIMESTAMP(3),
ADD COLUMN     "worker_container_id" TEXT,
ADD COLUMN     "worker_health" TEXT DEFAULT 'unknown',
ADD COLUMN     "worker_last_seen_at" TIMESTAMP(3),
ADD COLUMN     "worker_port" INTEGER,
ADD COLUMN     "worker_started_at" TIMESTAMP(3);
