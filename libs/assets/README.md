# assets

Static assets required by the app (icons, email graphics, in-app tutorial
illustrations, etc.) that need to live at a public, stable URL — served from
MinIO (`S3_BUCKET`, prefix `static/` by default).

## Folder structure

`static/` is organized by **purpose**, one top-level folder per category.
`mc mirror` preserves the tree as-is, so the folder layout _is_ the URL
structure — keep it intentional.

```
static/
├── app/                        # app identity: icon & favicon variants
│   ├── icon.png
│   ├── icon-light.png
│   ├── icon-dark.png
│   └── favicon.png
├── email/                      # graphics used only inside transactional emails
│   └── (empty for now)         # e.g. footer-bg.png — a footer band, a divider, a badge...
└── import-guides/              # tutorial screenshots for "import your data" flows
    ├── letterboxd/              (empty for now)
    └── senscritique/            (empty for now)
```

Resulting public URLs (`${S3_PUBLIC_ENDPOINT}/${S3_BUCKET}/static/...`):

- `.../static/app/icon.png`
- `.../static/email/footer-bg.png`
- `.../static/import-guides/letterboxd/step-1.png`

### Conventions

- **One top-level folder per category**, named after what the asset is _for_,
  not where it's consumed from (`import-guides/`, not `onboarding-screen/`).
- **One subfolder per source/variant** inside a category when it naturally
  splits that way (`import-guides/<provider>/`).
- Reuse existing assets across contexts by pointing at their real folder
  (e.g. the email header logo is `app/icon.png` — don't duplicate it under
  `email/`). Only put a file under `email/` if it doesn't belong anywhere
  else (a footer background, an email-only banner...).
- Keep filenames lowercase-kebab, e.g. `step-1.png`, `footer-bg.png`.
- Deleting a file here and pushing removes it from MinIO on the next deploy
  (see below) — don't leave stale files "just in case", nothing else in the
  repo should ever hardcode a `static/...` URL that isn't backed by a real
  file here.

## How it works

- Drop/update/delete files anywhere under `static/`, commit, push to `main`.
- The CD pipeline (`nx affected -t docker-build`) builds this project like any
  other Docker-shipped app, pushes `ghcr.io/paveorg/assets:<version>`, and
  bumps the image tag in the infra repo's `assets-sync` Job manifest.
- On deploy, that Job runs `mc mirror --remove` from the baked-in `/static`
  folder to `myminio/${S3_BUCKET}/${S3_ASSETS_PREFIX}` — uploading new/changed
  files and **deleting** remote files that were removed from `static/`.
- The bucket is created (if missing) and set to public/download on every run,
  so this project has no hard dependency on `minio-setup` having run first.

## Referencing an asset — typesafe

`static/` is mirrored into a generated, typesafe path manifest so consumers
never hand-type a `static/...` string that could go stale:

```ts
import { assetPaths, assetUrl } from '@libs/assets';
import { env } from '../env';

const logoUrl = assetUrl(assetPaths.app.icon, env.ASSETS_BASE_URL);
// -> `${ASSETS_BASE_URL}/app/icon.png`, autocompleted, and a compile error
//    if `app/icon.png` is renamed or removed from static/
```

`assetPaths` mirrors the `static/` folder tree 1:1 (kebab-case filenames
become camelCase keys, e.g. `icon-light.png` -> `iconLight`). It's generated
by `nx run assets:generate` (see `scripts/generate-manifest.ts`) into
`src/__generated__/manifest.ts` — **not committed** (see `.gitignore`), the
same pattern as `libs/api-js`'s OpenAPI codegen. Regenerate after
adding/renaming/removing a file:

```sh
npx nx run assets:generate
```

Any project whose `build` target should always see a fresh manifest declares
it explicitly, e.g. `apps/notify/project.json`:

```json
"build": {
  "dependsOn": [{ "target": "generate", "projects": "assets" }]
}
```

Locally, `${ASSETS_BASE_URL}` resolves to `http://localhost:9900/medias/static`,
so the example above resolves to `http://localhost:9900/medias/static/app/icon.png`.

## Local dev

`docker compose up assets-sync` builds this image and syncs `static/` into the
local MinIO. The compose service bind-mounts `./libs/assets/static` over the
image's baked-in copy, so new files show up without rebuilding the image —
just re-run `docker compose up assets-sync`.

Don't forget to also run `npx nx run assets:generate` after adding files so
`@libs/assets` picks them up for TypeScript consumers.

## Why a dedicated bucket prefix

`static/` is mirrored with `--remove`, i.e. it's a full sync that deletes
anything not present locally. Keeping it under its own prefix (rather than
mixing with user-uploaded media folders like `avatars/`) means this job can
never delete user content, even if misconfigured.
