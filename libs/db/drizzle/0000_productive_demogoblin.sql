CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE SCHEMA "i18n";
--> statement-breakpoint
CREATE SCHEMA "system";
--> statement-breakpoint
CREATE TYPE "public"."device_type_enum" AS ENUM('web', 'ios', 'android');--> statement-breakpoint
CREATE TYPE "public"."push_provider_enum" AS ENUM('fcm', 'apns');--> statement-breakpoint
CREATE TABLE "auth"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"issuer" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth"."user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"username" text NOT NULL,
	"display_username" text,
	"username_updated_at" timestamp with time zone,
	"language" text DEFAULT 'en-US' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "auth"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "i18n"."countries" (
	"iso_3166_1" char(2) PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "i18n"."default_countries" (
	"iso_639_1" char(2) PRIMARY KEY NOT NULL,
	"iso_3166_1" char(2)
);
--> statement-breakpoint
CREATE TABLE "i18n"."languages" (
	"iso_639_1" char(2) PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "i18n"."supported_languages" (
	"iso_639_1" char(2) NOT NULL,
	"iso_3166_1" char(2),
	"language" text PRIMARY KEY GENERATED ALWAYS AS (CASE WHEN iso_3166_1 IS NULL THEN iso_639_1 ELSE iso_639_1 || '-' || iso_3166_1 END) STORED NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system"."config" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bio" text,
	"background_image" text,
	"welcomed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "push_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"provider" "push_provider_enum" NOT NULL,
	"token" text NOT NULL,
	"device_type" "device_type_enum" DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "unique_user_token_provider" UNIQUE("user_id","token","provider")
);
--> statement-breakpoint
ALTER TABLE "auth"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."user" ADD CONSTRAINT "user_language_supported_languages_language_fk" FOREIGN KEY ("language") REFERENCES "i18n"."supported_languages"("language") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "i18n"."default_countries" ADD CONSTRAINT "default_countries_iso_639_1_languages_iso_639_1_fk" FOREIGN KEY ("iso_639_1") REFERENCES "i18n"."languages"("iso_639_1") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "i18n"."default_countries" ADD CONSTRAINT "default_countries_iso_3166_1_countries_iso_3166_1_fk" FOREIGN KEY ("iso_3166_1") REFERENCES "i18n"."countries"("iso_3166_1") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "i18n"."supported_languages" ADD CONSTRAINT "supported_languages_iso_639_1_languages_iso_639_1_fk" FOREIGN KEY ("iso_639_1") REFERENCES "i18n"."languages"("iso_639_1") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "i18n"."supported_languages" ADD CONSTRAINT "supported_languages_iso_3166_1_countries_iso_3166_1_fk" FOREIGN KEY ("iso_3166_1") REFERENCES "i18n"."countries"("iso_3166_1") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_id_user_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_token" ADD CONSTRAINT "push_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_token" ADD CONSTRAINT "push_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "auth"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "auth"."account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "auth"."account" USING btree ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "auth"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "auth"."session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "auth"."verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "idx_push_token_user_id" ON "push_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_push_token_session_id" ON "push_token" USING btree ("session_id");