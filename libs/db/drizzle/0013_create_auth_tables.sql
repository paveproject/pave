CREATE SCHEMA IF NOT EXISTS "auth";
--> statement-breakpoint
CREATE TABLE "auth"."accounts" (
	"id" varchar PRIMARY KEY NOT NULL,
	"account_id" varchar NOT NULL,
	"provider_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"access_token" varchar,
	"refresh_token" varchar,
	"id_token" varchar,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" varchar,
	"password" varchar,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."sessions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" varchar NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" varchar,
	"user_agent" varchar,
	"user_id" varchar NOT NULL,
	"active" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" varchar,
	"email" varchar,
	"email_verified" boolean NOT NULL,
	"image" varchar,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"username" varchar,
	"display_username" varchar
);
--> statement-breakpoint
CREATE TABLE "auth"."verifications" (
	"id" varchar PRIMARY KEY NOT NULL,
	"identifier" varchar NOT NULL,
	"value" varchar NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth"."accounts" ADD CONSTRAINT "fk_accounts_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "fk_sessions_user_id" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_accounts_provider_id_account_id" ON "auth"."accounts" USING btree ("provider_id" text_ops,"account_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_accounts_user_id" ON "auth"."accounts" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_sessions_expires_at" ON "auth"."sessions" USING btree ("expires_at" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sessions_token" ON "auth"."sessions" USING btree ("token" text_ops);--> statement-breakpoint
CREATE INDEX "idx_sessions_user_id" ON "auth"."sessions" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_email" ON "auth"."users" USING btree ("email" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_username" ON "auth"."users" USING btree ("username" text_ops);--> statement-breakpoint
CREATE INDEX "idx_verifications_identifier" ON "auth"."verifications" USING btree ("identifier" text_ops);--> statement-breakpoint
-- Moved from 0006_rename_profile_to_user.sql: auth.users didn't exist yet
-- at that point in migration order.
ALTER TABLE "user" ADD CONSTRAINT "user_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;