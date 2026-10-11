use axum::http::HeaderMap;
use hmac::{Hmac, Mac};
use sha2::Sha256;

const SIGNATURE_HEADER: &str = "x-apple-signature";
const SIGNATURE_PREFIX: &str = "hmacsha256=";

/// App Store Connect signs each delivery with HMAC-SHA256 over the raw
/// request body, using the secret configured for the webhook - sent as
/// `x-apple-signature: hmacsha256=<hex>`. `Mac::verify_slice` compares in
/// constant time, same property as Recomend's manual `timingSafeEqual`.
///
/// Not a `FromRequestParts` extractor (unlike
/// `app::internal::version_policy::guard::InternalSecretGuard`) - it needs
/// the raw body, which only `FromRequest` (consuming, not just the parts)
/// can see, so the handler extracts `Bytes` itself and calls this directly.
pub fn verify_signature(headers: &HeaderMap, body: &[u8], secret: &str) -> bool {
    let Some(header) = headers.get(SIGNATURE_HEADER).and_then(|v| v.to_str().ok()) else {
        return false;
    };
    let Some(provided_hex) = header.strip_prefix(SIGNATURE_PREFIX) else {
        return false;
    };
    let Ok(provided) = hex::decode(provided_hex) else {
        return false;
    };
    let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(secret.as_bytes()) else {
        return false;
    };

    mac.update(body);
    mac.verify_slice(&provided).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_a_correctly_signed_payload() {
        let secret = "webhook-secret";
        let body = br#"{"data":{"type":"test"}}"#;

        let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(body);
        let signature = hex::encode(mac.finalize().into_bytes());

        let mut headers = HeaderMap::new();
        headers.insert(
            SIGNATURE_HEADER,
            format!("{SIGNATURE_PREFIX}{signature}").parse().unwrap(),
        );

        assert!(verify_signature(&headers, body, secret));
    }

    #[test]
    fn rejects_a_wrong_signature() {
        let mut headers = HeaderMap::new();
        headers.insert(
            SIGNATURE_HEADER,
            format!("{SIGNATURE_PREFIX}{}", "00".repeat(32))
                .parse()
                .unwrap(),
        );

        assert!(!verify_signature(&headers, b"{}", "secret"));
    }

    #[test]
    fn rejects_a_missing_header() {
        assert!(!verify_signature(&HeaderMap::new(), b"{}", "secret"));
    }
}
