CREATE TYPE "public"."data_access_request_contact_status_enum" AS ENUM('pending', 'approved', 'declined');--> statement-breakpoint
CREATE TYPE "public"."data_access_request_status_enum" AS ENUM('pending', 'refused', 'failed');--> statement-breakpoint
CREATE TABLE "data_access_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"requester_user_id" text NOT NULL,
	"requesting_device_id" uuid NOT NULL,
	"status" "data_access_request_status_enum" DEFAULT 'pending' NOT NULL,
	"release_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"refused_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "check_data_access_request_status_timestamps" CHECK (
        (status = 'pending' AND refused_at IS NULL AND failed_at IS NULL)
        OR (status = 'refused' AND refused_at IS NOT NULL AND failed_at IS NULL)
        OR (status = 'failed' AND failed_at IS NOT NULL AND refused_at IS NULL)
      ),
	CONSTRAINT "check_data_access_request_window" CHECK ("data_access_request"."expires_at" > "data_access_request"."release_at"),
	CONSTRAINT "check_data_access_request_not_self" CHECK ("data_access_request"."requester_user_id" <> "data_access_request"."owner_user_id")
);
--> statement-breakpoint
CREATE TABLE "data_access_request_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_access_request_id" uuid NOT NULL,
	"trusted_contact_id" uuid NOT NULL,
	"status" "data_access_request_contact_status_enum" DEFAULT 'pending' NOT NULL,
	"encrypted_share" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "unique_data_access_request_contact" UNIQUE("data_access_request_id","trusted_contact_id"),
	CONSTRAINT "check_data_access_request_contact_share" CHECK (
        (status = 'approved' AND encrypted_share IS NOT NULL AND responded_at IS NOT NULL)
        OR (status = 'declined' AND responded_at IS NOT NULL)
        OR (status = 'pending' AND encrypted_share IS NULL AND responded_at IS NULL)
      )
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "data_access_delay_seconds" integer DEFAULT 86400 NOT NULL;--> statement-breakpoint
ALTER TABLE "data_access_request" ADD CONSTRAINT "data_access_request_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_access_request" ADD CONSTRAINT "data_access_request_requester_user_id_user_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_access_request" ADD CONSTRAINT "data_access_request_requesting_device_id_device_id_fk" FOREIGN KEY ("requesting_device_id") REFERENCES "public"."device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_access_request_contact" ADD CONSTRAINT "data_access_request_contact_data_access_request_id_data_access_request_id_fk" FOREIGN KEY ("data_access_request_id") REFERENCES "public"."data_access_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_access_request_contact" ADD CONSTRAINT "data_access_request_contact_trusted_contact_id_trusted_contact_id_fk" FOREIGN KEY ("trusted_contact_id") REFERENCES "public"."trusted_contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_data_access_request_owner_user_id" ON "data_access_request" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_data_access_request_requester_user_id" ON "data_access_request" USING btree ("requester_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_data_access_request_one_pending_per_pair" ON "data_access_request" USING btree ("owner_user_id","requester_user_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "idx_data_access_request_contact_request_id" ON "data_access_request_contact" USING btree ("data_access_request_id");--> statement-breakpoint
CREATE INDEX "idx_data_access_request_contact_trusted_contact_id" ON "data_access_request_contact" USING btree ("trusted_contact_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "check_user_data_access_delay_minimum" CHECK ("user"."data_access_delay_seconds" >= 7200);