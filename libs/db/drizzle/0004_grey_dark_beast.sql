ALTER TABLE "auth"."account" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth"."session" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth"."user" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth"."verification" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "auth"."account" CASCADE;--> statement-breakpoint
DROP TABLE "auth"."session" CASCADE;--> statement-breakpoint
DROP TABLE "auth"."user" CASCADE;--> statement-breakpoint
DROP TABLE "auth"."verification" CASCADE;--> statement-breakpoint
DROP SCHEMA "auth";
