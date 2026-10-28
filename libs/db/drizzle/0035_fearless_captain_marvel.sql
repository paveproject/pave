CREATE TABLE "report_family" (
	"key" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_type" (
	"key" text PRIMARY KEY NOT NULL,
	"family_key" text NOT NULL,
	"wire_code" smallint NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_type_wire_code_unique" UNIQUE("wire_code"),
	CONSTRAINT "report_type_wire_code_u8" CHECK ("report_type"."wire_code" between 0 and 254)
);
--> statement-breakpoint
ALTER TABLE "report" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "report_type" ADD CONSTRAINT "report_type_family_key_report_family_key_fk" FOREIGN KEY ("family_key") REFERENCES "public"."report_family"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_report_type_family" ON "report_type" USING btree ("family_key");--> statement-breakpoint
-- Seeded here, not left to the seed step, because the FK below is added in
-- this same migration: on a database that already has reports, an empty
-- `report_type` would fail it. `libs/db/src/lib/seed/report.seed.ts` stays the
-- source of truth and converges these rows on every deploy.
INSERT INTO "report_family" ("key") VALUES ('force_used'), ('presence'), ('movement'), ('aid'), ('surveillance'), ('other') ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
INSERT INTO "report_type" ("key", "family_key", "wire_code", "enabled") VALUES
  ('tear_gas', 'force_used', 0, true),
  ('police_presence', 'presence', 1, true),
  ('arrest', 'presence', 2, true),
  ('violence', 'force_used', 3, true),
  ('road_block', 'movement', 4, true),
  ('medical', 'aid', 5, true),
  ('water_cannon', 'force_used', 6, true),
  ('kettling', 'movement', 7, true),
  ('other', 'other', 8, true),
  ('stun_grenade', 'force_used', 9, true),
  ('kinetic_rounds', 'force_used', 10, true),
  ('live_ammunition', 'force_used', 11, true),
  ('pepper_spray', 'force_used', 12, false),
  ('baton_charge', 'force_used', 13, false),
  ('mounted_police', 'force_used', 14, false),
  ('vehicle_ramming', 'force_used', 15, false),
  ('military_presence', 'presence', 16, true),
  ('checkpoint', 'presence', 17, true),
  ('abduction', 'presence', 18, true),
  ('riot_police', 'presence', 19, false),
  ('fire', 'movement', 20, true),
  ('transit_closed', 'movement', 21, true),
  ('exit_blocked', 'movement', 22, false),
  ('safe_route', 'aid', 23, true),
  ('legal_support', 'aid', 24, false),
  ('water_supply', 'aid', 25, false),
  ('internet_shutdown', 'surveillance', 26, true),
  ('surveillance', 'surveillance', 27, false),
  ('press_targeted', 'surveillance', 28, false)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_type_report_type_key_fk" FOREIGN KEY ("type") REFERENCES "public"."report_type"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_report_type" ON "report" USING btree ("type");--> statement-breakpoint
DROP TYPE "public"."report_type_enum";