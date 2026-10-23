ALTER TABLE "protest_upload" DROP CONSTRAINT "protest_upload_session_id_protest_session_id_fk";--> statement-breakpoint
ALTER TABLE "protest_session" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "protest_upload" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "protest_upload" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "protest_upload" ALTER COLUMN "session_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "protest_upload" ADD CONSTRAINT "protest_upload_session_id_protest_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."protest_session"("id") ON DELETE cascade ON UPDATE no action;
