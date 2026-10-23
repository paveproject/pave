CREATE TABLE "recovery_key_mnemonic" (
	"user_id" text PRIMARY KEY NOT NULL,
	"encrypted_dek" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recovery_key_mnemonic" ADD CONSTRAINT "recovery_key_mnemonic_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;