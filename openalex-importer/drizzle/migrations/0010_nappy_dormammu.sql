ALTER TABLE "openalex"."works_authorships" ADD COLUMN "institution_ids" text[] DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "openalex"."works_authorships" DROP COLUMN "institution_id";