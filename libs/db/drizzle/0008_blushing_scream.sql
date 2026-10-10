ALTER TABLE "push_token" ALTER COLUMN "provider" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."push_provider_enum";--> statement-breakpoint
CREATE TYPE "public"."push_provider_enum" AS ENUM('expo');--> statement-breakpoint
ALTER TABLE "push_token" ALTER COLUMN "provider" SET DATA TYPE "public"."push_provider_enum" USING "provider"::"public"."push_provider_enum";