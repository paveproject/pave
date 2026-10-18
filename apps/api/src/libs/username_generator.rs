//! Xbox-gamertag-style usernames (`SilentFalcon482`) generated at signup -
//! see `auth_hooks::GenerateUsernameHook`. Self-contained, no extra
//! dependency: randomness comes from `Uuid::new_v4()`, same as
//! `trusted_contacts::handlers::generate_code`.

use auth::schema::user as auth_user;
use sea_orm::{ColumnTrait, ConnectionTrait, EntityTrait, QueryFilter};
use uuid::Uuid;

/// 4-7 letters each, so `{Adjective}{Noun}{2-3 digit number}` always fits
/// the mobile app's `usernameSchema` (3-20 chars, `^[a-zA-Z0-9_.]+$`).
const ADJECTIVES: &[&str] = &[
    "Swift", "Silent", "Brave", "Calm", "Bold", "Lucky", "Sunny", "Witty", "Sharp", "Quiet",
    "Happy", "Bright", "Clever", "Mellow", "Gentle", "Fierce", "Jolly", "Nimble", "Plucky",
    "Rowdy", "Zesty", "Spry", "Keen", "Merry", "Dapper", "Rapid", "Daring", "Cosmic", "Stellar",
    "Mighty", "Loyal", "Sly", "Fuzzy", "Crisp", "Vivid", "Royal", "Amber", "Coral", "Azure",
    "Lively",
];

/// Short animal names - 4-7 letters each.
const NOUNS: &[&str] = &[
    "Falcon", "Tiger", "Otter", "Panda", "Wolf", "Fox", "Hawk", "Bear", "Lynx", "Eagle", "Heron",
    "Raven", "Shark", "Whale", "Puma", "Lion", "Cobra", "Viper", "Gecko", "Moose", "Bison",
    "Badger", "Weasel", "Ferret", "Rabbit", "Beaver", "Dingo", "Jaguar", "Mantis", "Marlin",
    "Osprey", "Pigeon", "Sparrow", "Swan", "Toucan", "Turtle", "Walrus", "Yak", "Zebra", "Mole",
];

/// Picks one random adjective, one noun, and a 2-3 digit number. Returns
/// `(canonical_lowercase, display_cased)` - the first for uniqueness
/// checks, the second as the value to show if it wins.
fn random_candidate() -> (String, String) {
    let bytes = Uuid::new_v4().into_bytes();
    let adjective = ADJECTIVES[bytes[0] as usize % ADJECTIVES.len()];
    let noun = NOUNS[bytes[1] as usize % NOUNS.len()];
    let number = 10 + (u16::from(bytes[2]) << 8 | u16::from(bytes[3])) % 990;

    let display = format!("{adjective}{noun}{number}");
    let canonical = display.to_lowercase();
    (canonical, display)
}

const MAX_ATTEMPTS: u8 = 20;

/// Generates a username guaranteed free at the time of the check. Loops a
/// few times against random word combinations, falling back to a
/// guaranteed-unique hex suffix in the astronomically unlikely case all of
/// them collide.
pub async fn generate_unique_username<C: ConnectionTrait>(db: &C) -> (String, String) {
    for _ in 0..MAX_ATTEMPTS {
        let (canonical, display) = random_candidate();
        let taken = auth_user::Entity::find()
            .filter(auth_user::Column::Username.eq(canonical.clone()))
            .one(db)
            .await
            .expect("failed to check generated username uniqueness")
            .is_some();
        if !taken {
            return (canonical, display);
        }
    }

    let suffix = Uuid::new_v4().simple().to_string()[..8].to_string();
    (format!("user{suffix}"), format!("User{suffix}"))
}
