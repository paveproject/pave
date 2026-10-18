ALTER TYPE "public"."recovery_request_status_enum" ADD VALUE 'failed';--> statement-breakpoint
ALTER TABLE "recovery_request" ADD COLUMN "failed_at" timestamp with time zone;