CREATE TYPE "system"."platform" AS ENUM('ios', 'android', 'web');--> statement-breakpoint
CREATE TYPE "system"."version_release_state" AS ENUM('pending', 'live');--> statement-breakpoint
CREATE TABLE "system"."version_policy" (
	"platform" "system"."platform" NOT NULL,
	"version" text NOT NULL,
	"is_breaking" boolean DEFAULT false NOT NULL,
	"state" "system"."version_release_state" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "version_policy_platform_version_pk" PRIMARY KEY("platform","version"),
	CONSTRAINT "check_version_policy_version" CHECK (version ~ '^\d+(\.\d+){0,2}$')
);
