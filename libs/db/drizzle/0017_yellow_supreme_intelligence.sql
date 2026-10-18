CREATE TABLE "device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"public_key" text NOT NULL,
	"device_type" "device_type_enum" DEFAULT 'web' NOT NULL,
	"encrypted_dek" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "unique_user_public_key" UNIQUE("user_id","public_key")
);
--> statement-breakpoint
CREATE TABLE "trusted_contact_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trusted_contact_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"encrypted_share" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "unique_trusted_contact_device" UNIQUE("trusted_contact_id","device_id")
);
--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_contact_share" ADD CONSTRAINT "trusted_contact_share_trusted_contact_id_trusted_contact_id_fk" FOREIGN KEY ("trusted_contact_id") REFERENCES "public"."trusted_contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_contact_share" ADD CONSTRAINT "trusted_contact_share_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_device_user_id" ON "device" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_trusted_contact_share_trusted_contact_id" ON "trusted_contact_share" USING btree ("trusted_contact_id");--> statement-breakpoint
CREATE INDEX "idx_trusted_contact_share_device_id" ON "trusted_contact_share" USING btree ("device_id");--> statement-breakpoint
ALTER TABLE "trusted_contact" DROP COLUMN "encrypted_share";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "public_key";