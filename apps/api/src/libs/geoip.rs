//! Local GeoIP lookup (MaxMind GeoLite2 City `.mmdb`) - resolves a client
//! IP to a coarse city/country, entirely in-process, so no third party
//! ever sees a user's IP just to answer "roughly where is this". Backs
//! the "new device trying to sign in from Paris, France" prompt shown to
//! an approving sibling (see `devices::handlers::set_device`) - the same
//! idea as Amazon/Google's own device-approval emails.
//!
//! The `.mmdb` file itself is never committed (MaxMind requires a free
//! account + license key to download it) - `GeoIp::open` returns `None`
//! when `GEOIP_DB_PATH` isn't set or the file isn't there yet, same "ship
//! before credentials exist" reasoning as `AppStoreConnectClient`:
//! `set_device` just skips resolving a location rather than failing the
//! request.
//!
//! Approximate by construction (VPNs, carrier NAT, and corporate proxies
//! can all put this far from the device's real location) - never surface
//! this as ground truth, only ever labelled as approximate in the UI.

use axum::http::HeaderMap;
use std::net::IpAddr;

/// The real client IP, as seen by whatever's in front of this process -
/// the raw TCP peer address is useless here, it's always the in-cluster
/// ingress/load balancer, never the device that actually made the
/// request. Checks `x-forwarded-for` first (first entry - the ingress
/// appends its own hop after the original client's, standard reverse-
/// proxy convention), then `x-real-ip`. `None` in local dev, where
/// nothing sets either header - that's fine, it just means no location
/// gets resolved there.
pub fn client_ip_from_headers(headers: &HeaderMap) -> Option<IpAddr> {
    let forwarded_for = headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .and_then(|ip| ip.parse().ok());
    if forwarded_for.is_some() {
        return forwarded_for;
    }

    headers
        .get("x-real-ip")
        .and_then(|value| value.to_str().ok())
        .and_then(|ip| ip.trim().parse().ok())
}

pub struct GeoIp {
    reader: maxminddb::Reader<Vec<u8>>,
}

impl GeoIp {
    /// `None` if `path` is `None` or the file can't be opened (missing,
    /// corrupt, wrong format) - logged, not panicked.
    pub fn open(path: Option<&str>) -> Option<Self> {
        let path = path?;
        match maxminddb::Reader::open_readfile(path) {
            Ok(reader) => Some(Self { reader }),
            Err(err) => {
                tracing::warn!(%err, %path, "failed to open GeoIP database, locations will be skipped");
                None
            }
        }
    }

    /// `(city, country)`, both in English (the mmdb's own `en` locale) -
    /// `None` if the IP isn't in the database (private/reserved ranges,
    /// e.g. every local-dev request, always miss) or carries no city-level
    /// data for that range.
    pub fn lookup_city_country(&self, ip: IpAddr) -> Option<(String, String)> {
        let city: maxminddb::geoip2::City = self
            .reader
            .lookup(ip)
            .inspect_err(|err| tracing::debug!(%err, %ip, "geoip lookup failed"))
            .ok()??;

        let city_name = city
            .city
            .and_then(|c| c.names)
            .and_then(|names| names.get("en").map(|s| s.to_string()));
        let country_name = city
            .country
            .and_then(|c| c.names)
            .and_then(|names| names.get("en").map(|s| s.to_string()));

        match (city_name, country_name) {
            (Some(city), Some(country)) => Some((city, country)),
            _ => None,
        }
    }
}
