CREATE TABLE "recovery_dek_generation" (
	"user_id" text PRIMARY KEY NOT NULL,
	"generation" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recovery_dek_generation" ADD CONSTRAINT "recovery_dek_generation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;