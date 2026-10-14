CREATE TYPE "public"."trusted_contact_status_enum" AS ENUM('pending', 'accepted', 'declined', 'revoked');--> statement-breakpoint
CREATE TABLE "trusted_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"contact_user_id" text,
	"status" "trusted_contact_status_enum" DEFAULT 'pending' NOT NULL,
	"invite_code_hash" text NOT NULL,
	"invite_code_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "unique_owner_contact" UNIQUE("owner_user_id","contact_user_id")
);
--> statement-breakpoint
ALTER TABLE "trusted_contact" ADD CONSTRAINT "trusted_contact_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_contact" ADD CONSTRAINT "trusted_contact_contact_user_id_user_id_fk" FOREIGN KEY ("contact_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_trusted_contact_owner_user_id" ON "trusted_contact" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_trusted_contact_contact_user_id" ON "trusted_contact" USING btree ("contact_user_id");--> statement-breakpoint
CREATE INDEX "idx_trusted_contact_invite_code_hash" ON "trusted_contact" USING btree ("invite_code_hash");