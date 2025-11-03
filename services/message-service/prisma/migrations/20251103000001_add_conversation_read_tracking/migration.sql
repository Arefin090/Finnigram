-- Migration: Add conversation-level read tracking and status events audit table
-- This migration adds support for Instagram/Messenger-style conversation read tracking

-- Add last_read_message_id pointer to conversation_participants table
ALTER TABLE "conversation_participants" 
ADD COLUMN "last_read_message_id" INTEGER REFERENCES "messages"("id") ON DELETE SET NULL;

-- Create message_status_events audit table for tracking all status changes
CREATE TABLE "message_status_events" (
    "id" SERIAL PRIMARY KEY,
    "message_id" INTEGER NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
    "conversation_id" INTEGER NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
    "user_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "previous_status" VARCHAR(20),
    "timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "device_id" VARCHAR(255),
    "metadata" JSONB
);

-- Add performance indexes for conversation-level status lookups
CREATE INDEX "idx_conversation_participants_last_read" ON "conversation_participants"("conversation_id", "last_read_message_id");
CREATE INDEX "idx_conversation_participants_user_last_read" ON "conversation_participants"("user_id", "last_read_message_id");
CREATE INDEX "idx_message_status_events_message_id" ON "message_status_events"("message_id");
CREATE INDEX "idx_message_status_events_conversation_user" ON "message_status_events"("conversation_id", "user_id");
CREATE INDEX "idx_message_status_events_timestamp" ON "message_status_events"("timestamp" DESC);

-- Add comment explaining the new read tracking approach
COMMENT ON COLUMN "conversation_participants"."last_read_message_id" IS 'Pointer to the last message read by this user in this conversation. Used for Instagram/Messenger-style conversation read tracking instead of per-message status.';
COMMENT ON TABLE "message_status_events" IS 'Audit table tracking all message status changes for debugging, metrics, and event sourcing.';