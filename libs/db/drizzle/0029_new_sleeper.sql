-- Nothing using this data is in production yet, so rows that predate the
-- mobile app's switch to real UUID ids (see
-- `apps/mobile/src/lib/watermelon/database.ts`) are simply discarded
-- rather than migrated - there's no format that would survive the cast.
ALTER TABLE "protest_upload" DROP CONSTRAINT "protest_upload_session_id_protest_session_id_fk";--> statement-breakpoint
TRUNCATE TABLE "protest_upload";--> statement-breakpoint
TRUNCATE TABLE "protest_session" CASCADE;--> statement-breakpoint
TRUNCATE TABLE "report";--> statement-breakpoint
ALTER TABLE "protest_session" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "protest_upload" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "protest_upload" ALTER COLUMN "session_id" SET DATA TYPE uuid USING "session_id"::uuid;--> statement-breakpoint
ALTER TABLE "report" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "protest_upload" ADD CONSTRAINT "protest_upload_session_id_protest_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."protest_session"("id") ON DELETE cascade ON UPDATE no action;
