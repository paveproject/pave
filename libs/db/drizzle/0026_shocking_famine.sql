ALTER TABLE "user" ADD COLUMN "protest_mode_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "recovery_delay_seconds" integer DEFAULT 86400 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "recovery_delay_protest_seconds" integer DEFAULT 3600 NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "check_user_recovery_delay_protest_shorter" CHECK ("user"."recovery_delay_protest_seconds" < "user"."recovery_delay_seconds");