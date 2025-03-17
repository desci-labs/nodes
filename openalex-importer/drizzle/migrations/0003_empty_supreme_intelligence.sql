ALTER TABLE "openalex"."batch" RENAME COLUMN "createdAt" TO "created_at";--> statement-breakpoint
ALTER TABLE "openalex"."batch" RENAME COLUMN "updatedAt" TO "updated_at";--> statement-breakpoint
ALTER TABLE "openalex"."works_batch" DROP CONSTRAINT "works_batch_work_id_unique";--> statement-breakpoint
ALTER TABLE "openalex"."works_batch" DROP CONSTRAINT "works_batch_batch_id_unique";--> statement-breakpoint
ALTER TABLE "openalex"."works_batch" ALTER COLUMN "work_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "openalex"."works_batch" ALTER COLUMN "batch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "openalex"."works_batch" ADD CONSTRAINT "works_batch_work_id_batch_id_pk" PRIMARY KEY("work_id","batch_id");--> statement-breakpoint
CREATE INDEX "work_batches_work_id_idx" ON "openalex"."works_batch" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "work_batches_batch_id_idx" ON "openalex"."works_batch" USING btree ("batch_id");