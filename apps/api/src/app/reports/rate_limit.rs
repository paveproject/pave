use redis::AsyncCommands;

/// Fixed-window counters, enforced together - short window catches a tight
/// script loop fast, the long window catches a slower drip that stays under
/// the short window's radar. Tune freely; these aren't meant to bother a
/// real person reporting what they're actually seeing.
const WINDOWS: &[(&str, u64, i64)] = &[
    // (label, window seconds, max requests in that window)
    ("minute", 60, 5),
    ("hour", 3600, 20),
];

/// Checks and consumes one "report creation" slot for `user_id`, across all
/// configured windows. Each window is a single Redis key
/// (`ratelimit:reports:create:{user_id}:{label}`) incremented with `INCR`;
/// the key's TTL is set right after the increment that creates it (i.e.
/// only when the counter was `1`), so the window always expires at
/// `window_seconds` after the *first* request in it, not a sliding time
/// from the latest one.
///
/// Not perfectly atomic (a concurrent request between `INCR` and `EXPIRE`
/// could in theory see a key with no TTL yet), which is an acceptable
/// trade-off for abuse-prevention rather than billing-grade accounting.
pub async fn check_report_rate_limit(
    redis: &mut redis::aio::ConnectionManager,
    user_id: &str,
) -> Result<(), ()> {
    for (label, window_secs, max_requests) in WINDOWS {
        let key = format!("ratelimit:reports:create:{user_id}:{label}");

        let count: i64 = match redis.incr(&key, 1).await {
            Ok(count) => count,
            Err(err) => {
                // Redis being down shouldn't take report creation down with
                // it - fail open, just log it.
                tracing::error!(%err, "rate limit check failed, allowing request");
                return Ok(());
            }
        };

        if count == 1 {
            let _: Result<(), _> = redis.expire(&key, *window_secs as i64).await;
        }

        if count > *max_requests {
            return Err(());
        }
    }

    Ok(())
}
