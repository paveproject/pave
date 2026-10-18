UPDATE "auth"."users" SET display_username = username, username = lower(username) WHERE display_username IS NULL;--> statement-breakpoint
ALTER TABLE "auth"."users" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."users" ALTER COLUMN "display_username" SET NOT NULL;
