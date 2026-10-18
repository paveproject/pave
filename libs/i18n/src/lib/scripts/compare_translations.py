import json
import os
import sys

REFERENCE_FILE = "en-US.json"

def flatten_dict(d, parent_key="", sep="."):
    """Flatten nested dictionaries (e.g. {"a": {"b": "c"}} -> {"a.b": "c"})"""
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def compare_translations(i18n_dir):
    reference_path = os.path.join(i18n_dir, REFERENCE_FILE)
    if not os.path.exists(reference_path):
        print(f"Reference file not found: {reference_path}")
        sys.exit(1)

    ref_data = flatten_dict(load_json(reference_path))
    ref_keys = set(ref_data.keys())

    print(f"Reference: {REFERENCE_FILE} ({len(ref_keys)} keys)\n")

    for file in os.listdir(i18n_dir):
        if not file.endswith(".json") or file == REFERENCE_FILE:
            continue

        path = os.path.join(i18n_dir, file)
        data = flatten_dict(load_json(path))
        keys = set(data.keys())

        missing = ref_keys - keys
        extra = keys - ref_keys

        print(f"== {file} ==")
        print(f"Total keys: {len(keys)}")
        print(f"Missing keys: {len(missing)}")
        if missing:
            print("  " + "\n  ".join(sorted(missing)))
        print(f"Extra keys: {len(extra)}")
        if extra:
            print("  " + "\n  ".join(sorted(extra)))
        print()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 check.py <path_to_i18n_folder>")
        sys.exit(1)

    folder = sys.argv[1]
    if not os.path.isdir(folder):
        print(f"Invalid folder: {folder}")
        sys.exit(1)

    compare_translations(folder)
