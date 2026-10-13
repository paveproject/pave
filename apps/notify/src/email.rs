//! HTML rendering for the single auth-email layout. Replaces the old
//! react-email templates (`EmailLayout` + `VerificationEmail`/`DeleteAccount`)
//! with one plain Rust function: every existing job maps to the same
//! heading + text + optional button card.

use chrono::Utc;

const COLOR_BACKGROUND: &str = "#f4f4f5";
const COLOR_CARD: &str = "#ffffff";
const COLOR_BORDER: &str = "#e4e4e7";
const COLOR_TEXT: &str = "#18181b";
const COLOR_MUTED: &str = "#71717a";
const COLOR_BRAND: &str = "#0b0909";

/// `button` is `(label, href)`; omitted entirely when `None`, matching the
/// original templates where an OTP email never rendered a button.
pub fn render(
    title: &str,
    text: &str,
    button: Option<(&str, &str)>,
    assets_base_url: &str,
) -> String {
    let button_html = match button {
        Some((label, href)) => format!(
            r#"<a href="{href}" style="background-color:{COLOR_BRAND};color:#ffffff;font-size:14px;font-weight:600;border-radius:8px;padding:12px 20px;text-decoration:none;display:inline-block;">{label}</a>"#
        ),
        None => String::new(),
    };

    format!(
        r#"<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /></head>
<body style="background-color:{COLOR_BACKGROUND};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin:0;padding:32px 12px;">
  <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;" cellpadding="0" cellspacing="0">
    <tr><td style="text-align:center;padding:8px 0 24px;">
      <img src="{logo}" width="40" height="40" alt="Pavé" style="border-radius:10px;" />
    </td></tr>
    <tr><td style="background-color:{COLOR_CARD};border:1px solid {COLOR_BORDER};border-radius:12px;padding:32px;">
      <h1 style="font-size:20px;line-height:28px;color:{COLOR_TEXT};margin:0 0 12px;">{title}</h1>
      <p style="font-size:14px;line-height:22px;color:{COLOR_TEXT};margin:0 0 24px;">{text}</p>
      {button_html}
    </td></tr>
    <tr><td>
      <hr style="border-color:{COLOR_BORDER};margin:24px 0 16px;" />
      <p style="color:{COLOR_MUTED};font-size:12px;line-height:18px;text-align:center;padding:0 16px;">
        © {year} Pavé. This email was sent to you because you have an account on Pavé.
      </p>
    </td></tr>
  </table>
</body>
</html>"#,
        logo = assets_rs::asset_url(assets_rs::paths::app::ICON, assets_base_url),
        year = Utc::now().format("%Y"),
    )
}
