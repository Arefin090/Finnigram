-- CreateTable
CREATE TABLE IF NOT EXISTS "user_events_outbox" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "event_data" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(6),

    CONSTRAINT "user_events_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_events_outbox_processed_created_at_idx" ON "user_events_outbox"("processed", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_events_outbox_user_id_idx" ON "user_events_outbox"("user_id");