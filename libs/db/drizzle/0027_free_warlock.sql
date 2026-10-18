CREATE TYPE "public"."protest_upload_kind_enum" AS ENUM('position_batch', 'audio_chunk');--> statement-breakpoint
CREATE TABLE "protest_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protest_upload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" "protest_upload_kind_enum" NOT NULL,
	"s3_key" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "protest_session" ADD CONSTRAINT "protest_session_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protest_upload" ADD CONSTRAINT "protest_upload_session_id_protest_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."protest_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_protest_session_owner_user_id" ON "protest_session" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_protest_upload_session_id" ON "protest_upload" USING btree ("session_id");