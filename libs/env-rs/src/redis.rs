use serde::Deserialize;

/// `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` - shared by every service
/// that talks to the same Redis instance (BullMQ queues in `apps/api`
/// and `apps/notify`, `apps/api`'s rate limiter and reports pub/sub).
/// Load it on its own (`env_rs::load::<RedisConfig>()`), separately
/// from each app's own config struct.
#[derive(Debug, Clone, Deserialize)]
pub struct RedisConfig {
    #[serde(default = "default_host")]
    pub redis_host: String,
    #[serde(default = "default_port")]
    pub redis_port: u16,
    #[serde(default)]
    pub redis_password: Option<String>,
}

fn default_host() -> String {
    "localhost".to_string()
}

fn default_port() -> u16 {
    6379
}

impl RedisConfig {
    pub fn url(&self) -> String {
        match &self.redis_password {
            Some(password) if !password.is_empty() => {
                format!(
                    "redis://:{password}@{}:{}",
                    self.redis_host, self.redis_port
                )
            }
            _ => format!("redis://{}:{}", self.redis_host, self.redis_port),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_localhost_with_no_password() {
        // SAFETY: tests run single-threaded within this crate, no other
        // test mutates these specific env vars.
        unsafe {
            std::env::remove_var("REDIS_HOST");
            std::env::remove_var("REDIS_PORT");
            std::env::remove_var("REDIS_PASSWORD");
        }
        let config: RedisConfig = envy::from_env().expect("should load with all defaults");
        assert_eq!(config.url(), "redis://localhost:6379");
    }

    #[test]
    fn builds_url_with_password() {
        let config = RedisConfig {
            redis_host: "redis".to_string(),
            redis_port: 6380,
            redis_password: Some("hunter2".to_string()),
        };
        assert_eq!(config.url(), "redis://:hunter2@redis:6380");
    }
}
