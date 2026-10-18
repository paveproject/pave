use sea_orm::{ConnectionTrait, Statement};
use test_support::{start_test_database, start_test_redis};

#[tokio::test]
async fn postgres_testcontainer_migrates_and_resets() {
    let db = start_test_database().await;

    let conn = db.reset().await;
    let rows = conn
        .query_all_raw(Statement::from_string(
            conn.get_database_backend(),
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'device'".to_string(),
        ))
        .await
        .expect("query failed");
    assert_eq!(
        rows.len(),
        1,
        "expected the migrated `device` table to exist"
    );

    // reset() again - proves the template-based recreate is repeatable.
    let conn2 = db.reset().await;
    let rows2 = conn2
        .query_all_raw(Statement::from_string(
            conn2.get_database_backend(),
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'device'".to_string(),
        ))
        .await
        .expect("query failed after second reset");
    assert_eq!(rows2.len(), 1);
}

#[tokio::test]
async fn redis_testcontainer_is_reachable() {
    let test_redis = start_test_redis().await;
    let client = redis::Client::open(test_redis.url()).expect("invalid redis url");
    let mut conn = client
        .get_multiplexed_async_connection()
        .await
        .expect("failed to connect to redis testcontainer");
    let pong: String = redis::cmd("PING")
        .query_async(&mut conn)
        .await
        .expect("PING failed");
    assert_eq!(pong, "PONG");
}
