//! Generates `paths::<folder>::<FILE>` constants from `libs/assets/static/**`
//! at compile time - see `src/lib.rs` for why this beats the TS sibling's
//! "remember to run `nx run assets:generate`" step.
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    let manifest_dir = PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set by cargo"),
    );
    // libs/assets-rs/../assets/static - the TS sibling's static/ is the one
    // and only source of truth, not duplicated here.
    let static_dir = manifest_dir.join("..").join("assets").join("static");
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR not set by cargo"));

    println!("cargo:rerun-if-changed={}", static_dir.display());

    if !static_dir.is_dir() {
        panic!("static assets folder not found: {}", static_dir.display());
    }

    let body = walk(&static_dir, "");
    fs::write(out_dir.join("manifest.rs"), body).expect("failed to write generated asset manifest");
}

fn walk(dir: &Path, rel_prefix: &str) -> String {
    let mut entries: Vec<_> = fs::read_dir(dir)
        .unwrap_or_else(|err| panic!("failed to read {}: {err}", dir.display()))
        .filter_map(|entry| entry.ok())
        .filter(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
        .collect();
    entries.sort_by_key(|entry| entry.file_name());

    let mut out = String::new();
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = entry.path();
        let rel_path = if rel_prefix.is_empty() {
            name.clone()
        } else {
            format!("{rel_prefix}/{name}")
        };

        if path.is_dir() {
            let mod_name = to_identifier(&name, false);
            let inner = walk(&path, &rel_path);
            out.push_str(&format!("pub mod {mod_name} {{\n{inner}}}\n"));
        } else {
            let stem = name
                .rsplit_once('.')
                .map_or(name.as_str(), |(stem, _)| stem);
            let const_name = to_identifier(stem, true);
            out.push_str(&format!("pub const {const_name}: &str = {rel_path:?};\n"));
        }
    }
    out
}

/// `static/`'s own convention is lowercase-kebab (see libs/assets/README.md) -
/// this just swaps `-` for `_` and upper-cases for constants, prefixing an
/// underscore if that still wouldn't be a valid Rust identifier.
fn to_identifier(name: &str, upper: bool) -> String {
    let mut ident = name.replace('-', "_");
    if upper {
        ident = ident.to_uppercase();
    }
    if ident.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        ident = format!("_{ident}");
    }
    ident
}
