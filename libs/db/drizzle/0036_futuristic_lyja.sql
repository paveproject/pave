CREATE TYPE "public"."protest_blob_kind_enum" AS ENUM('position_batch', 'audio_chunk');--> statement-breakpoint
CREATE TABLE "protest_blob" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" "protest_blob_kind_enum" NOT NULL,
	"s3_key" text NOT NULL,
	"size" integer NOT NULL,
	"seq" integer NOT NULL,
	CONSTRAINT "unique_protest_blob_session_seq" UNIQUE("session_id","seq")
);
--> statement-breakpoint
CREATE TABLE "protest_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sealed_key" text NOT NULL,
	"metadata" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "protest_blob" ADD CONSTRAINT "protest_blob_session_id_protest_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."protest_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protest_session" ADD CONSTRAINT "protest_session_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_protest_blob_session_id" ON "protest_blob" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_protest_session_owner_user_id" ON "protest_session" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_protest_session_one_active_per_owner" ON "protest_session" USING btree ("owner_user_id") WHERE active;