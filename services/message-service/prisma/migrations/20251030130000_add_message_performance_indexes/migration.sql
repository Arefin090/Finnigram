-- CreateIndex
CREATE INDEX IF NOT EXISTS "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at" DESC);

-- CreateIndex  
CREATE INDEX IF NOT EXISTS "messages_sender_id_idx" ON "messages"("sender_id");