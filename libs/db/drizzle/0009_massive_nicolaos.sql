CREATE TYPE "public"."report_type_enum" AS ENUM('tear_gas', 'police_presence', 'arrest', 'violence', 'road_block', 'medical', 'other');--> statement-breakpoint
CREATE TABLE "report" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "report_type_enum" NOT NULL,
	"location" geometry(Point, 4326) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_report_location" ON "report" USING gist ("location");--> statement-breakpoint
CREATE INDEX "idx_report_expires_at" ON "report" USING btree ("expires_at");