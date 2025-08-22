-- CreateIndex: Add GIN index for ExternalApiUsage.queryingData field
-- This allows efficient JSON containment queries on the queryingData field

CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_external_api_usage_querying_data_gin" 
ON "ExternalApiUsage" USING GIN ("queryingData");

