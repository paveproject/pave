/**
 * Rasterises the report icon SVGs to the PNGs the app actually ships.
 *
 * MapLibre uploads into the native sprite atlas, which takes pixels, so the
 * SVG masters next to the output are the source of record and these PNGs are
 * derived - re-run after editing any of them.
 *
 * 512 px because that is what the cluster artwork already uses and what the
 * layer's `icon-size` multipliers in `screens/home/HomeMap.tsx` are calibrated
 * against: on-screen size is `512 * icon-size`. It also covers the largest
 * in-app use (the 64 pt picker thumbnail at @3x = 192 px) with room to spare,
 * so no `@2x`/`@3x` variants are needed.
 *
 * Do not reach for `qlmanage` here, however tempting it is as a zero-install
 * macOS rasteriser: it composites onto an opaque white background, which is
 * invisible in a thumbnail and ruins every marker on the map.
 */
import sharp from 'sharp';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(import.meta.dir, '../src/assets/images/map/reports');
const SIZE = 512;

const svgs = readdirSync(DIR)
  .filter((f) => f.endsWith('.svg'))
  .sort();

if (svgs.length === 0) throw new Error(`no SVG masters in ${DIR}`);

let total = 0;

for (const file of svgs) {
  const name = file.slice(0, -'.svg'.length);
  const png = await sharp(join(DIR, file), { density: SIZE })
    .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  // Guard the exact failure that shipped once: an alpha channel can exist and
  // still be fully opaque if the renderer flattened onto a background.
  const { channels } = await sharp(png).stats();
  if (channels.length < 4 || channels[3].min !== 0) {
    throw new Error(`${name}.png has no transparent pixels - check the renderer`);
  }

  await Bun.write(join(DIR, `${name}.png`), png);
  total += png.length;
}

console.log(
  `Rendered ${svgs.length} icons at ${SIZE}px ` +
    `(${(total / 1024 / 1024).toFixed(2)} MB, avg ${Math.round(total / svgs.length / 1024)} KB).`,
);
