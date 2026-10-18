CREATE TYPE "public"."device_status_enum" AS ENUM('pending', 'active');--> statement-breakpoint
CREATE TYPE "public"."recovery_request_contact_status_enum" AS ENUM('pending', 'approved', 'declined');--> statement-breakpoint
CREATE TYPE "public"."recovery_request_status_enum" AS ENUM('pending', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "recovery_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"requesting_device_id" uuid NOT NULL,
	"status" "recovery_request_status_enum" DEFAULT 'pending' NOT NULL,
	"release_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_request_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recovery_request_id" uuid NOT NULL,
	"trusted_contact_id" uuid NOT NULL,
	"status" "recovery_request_contact_status_enum" DEFAULT 'pending' NOT NULL,
	"encrypted_share" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_recovery_request_trusted_contact" UNIQUE("recovery_request_id","trusted_contact_id")
);
--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "status" "device_status_enum" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "recovery_request" ADD CONSTRAINT "recovery_request_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_request" ADD CONSTRAINT "recovery_request_requesting_device_id_device_id_fk" FOREIGN KEY ("requesting_device_id") REFERENCES "public"."device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_request_contact" ADD CONSTRAINT "recovery_request_contact_recovery_request_id_recovery_request_id_fk" FOREIGN KEY ("recovery_request_id") REFERENCES "public"."recovery_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_request_contact" ADD CONSTRAINT "recovery_request_contact_trusted_contact_id_trusted_contact_id_fk" FOREIGN KEY ("trusted_contact_id") REFERENCES "public"."trusted_contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_recovery_request_owner_user_id" ON "recovery_request" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_recovery_request_requesting_device_id" ON "recovery_request" USING btree ("requesting_device_id");--> statement-breakpoint
CREATE INDEX "idx_recovery_request_contact_recovery_request_id" ON "recovery_request_contact" USING btree ("recovery_request_id");--> statement-breakpoint
CREATE INDEX "idx_recovery_request_contact_trusted_contact_id" ON "recovery_request_contact" USING btree ("trusted_contact_id");