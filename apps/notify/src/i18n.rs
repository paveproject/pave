//! Flat key→string lookup over the existing `assets/i18n/*/auth.json`
//! dictionaries, baked into the binary at compile time with `include_str!`
//! so the service has no runtime dependency on where it's run from.

use notify_contracts::Lang;
use std::collections::HashMap;

const EN_AUTH_JSON: &str = include_str!("assets/i18n/en-US/auth.json");
const FR_AUTH_JSON: &str = include_str!("assets/i18n/fr-FR/auth.json");
const EN_TRUSTED_CONTACT_JSON: &str = include_str!("assets/i18n/en-US/trusted_contact.json");
const FR_TRUSTED_CONTACT_JSON: &str = include_str!("assets/i18n/fr-FR/trusted_contact.json");

#[derive(Clone)]
pub struct Dictionaries {
    en: HashMap<String, String>,
    fr: HashMap<String, String>,
}

impl Dictionaries {
    pub fn load() -> Self {
        let mut en = flatten_dict("auth", EN_AUTH_JSON);
        let mut fr = flatten_dict("auth", FR_AUTH_JSON);
        en.extend(flatten_dict("trusted_contact", EN_TRUSTED_CONTACT_JSON));
        fr.extend(flatten_dict("trusted_contact", FR_TRUSTED_CONTACT_JSON));
        Self { en, fr }
    }

    /// Returns the raw key itself if missing, so a translation gap shows up
    /// as an obviously-wrong string in the sent email rather than a panic.
    pub fn t(&self, lang: Lang, key: &str) -> String {
        let dict = match lang {
            Lang::En => &self.en,
            Lang::Fr => &self.fr,
        };
        dict.get(key).cloned().unwrap_or_else(|| key.to_string())
    }
}

fn flatten_dict(prefix: &str, raw: &str) -> HashMap<String, String> {
    let json: serde_json::Value =
        serde_json::from_str(raw).expect("bundled i18n dictionary must be valid JSON");
    let mut out = HashMap::new();
    flatten(prefix, &json, &mut out);
    out
}

fn flatten(prefix: &str, value: &serde_json::Value, out: &mut HashMap<String, String>) {
    match value {
        serde_json::Value::Object(map) => {
            for (k, v) in map {
                flatten(&format!("{prefix}.{k}"), v, out);
            }
        }
        serde_json::Value::String(s) => {
            out.insert(prefix.to_string(), s.clone());
        }
        _ => {}
    }
}
