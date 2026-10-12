-- Custom SQL migration file, put your code below! --

-- Drop the FK that pointed at profile.id before we touch its type/name.
ALTER TABLE "push_token" DROP CONSTRAINT "push_token_user_id_profile_id_fk";
--> statement-breakpoint

ALTER TABLE "profile" RENAME TO "user";
--> statement-breakpoint

-- id becomes text to match auth.users.id (Rust auth service), so we can
-- add a real cross-schema FK below.
ALTER TABLE "user" ALTER COLUMN "id" TYPE text USING "id"::text;
--> statement-breakpoint

ALTER TABLE "user" ADD COLUMN "language" text NOT NULL DEFAULT 'en-US';
--> statement-breakpoint

ALTER TABLE "user" ADD COLUMN "username_updated_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "user" ADD CONSTRAINT "user_language_supported_languages_language_fk"
  FOREIGN KEY ("language") REFERENCES "i18n"."supported_languages"("language")
  ON UPDATE CASCADE ON DELETE RESTRICT;
--> statement-breakpoint

-- user_id_users_id_fk (user.id -> auth.users.id) moves to the migration
-- that creates auth.users (0013) - that schema/table doesn't exist yet
-- at this point in migration order.

ALTER TABLE "push_token" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
--> statement-breakpoint

ALTER TABLE "push_token" ADD CONSTRAINT "push_token_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
