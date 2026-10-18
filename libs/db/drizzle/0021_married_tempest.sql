ALTER TABLE "recovery_request" ADD CONSTRAINT "check_recovery_request_status_timestamps" CHECK (
        (status = 'pending' AND completed_at IS NULL AND cancelled_at IS NULL AND failed_at IS NULL)
        OR (status = 'completed' AND completed_at IS NOT NULL AND cancelled_at IS NULL AND failed_at IS NULL)
        OR (status = 'cancelled' AND cancelled_at IS NOT NULL AND completed_at IS NULL AND failed_at IS NULL)
        OR (status = 'failed' AND failed_at IS NOT NULL AND completed_at IS NULL AND cancelled_at IS NULL)
      );