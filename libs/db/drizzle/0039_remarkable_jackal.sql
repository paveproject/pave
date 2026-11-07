ALTER TYPE "public"."data_access_request_status_enum" ADD VALUE 'expired';--> statement-breakpoint
ALTER TABLE "data_access_request" DROP CONSTRAINT "check_data_access_request_status_timestamps";--> statement-breakpoint
ALTER TABLE "data_access_request" ADD CONSTRAINT "check_data_access_request_status_timestamps" CHECK (
        (status::text = 'pending' AND refused_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL)
        OR (status::text = 'refused' AND refused_at IS NOT NULL AND failed_at IS NULL AND cancelled_at IS NULL)
        OR (status::text = 'failed' AND failed_at IS NOT NULL AND refused_at IS NULL AND cancelled_at IS NULL)
        OR (status::text = 'cancelled' AND cancelled_at IS NOT NULL AND refused_at IS NULL AND failed_at IS NULL)
        OR (status::text = 'expired' AND refused_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL)
      );