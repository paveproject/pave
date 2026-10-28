/**
 * Rasterises the report icon SVGs to the PNGs the app actually ships.
 *
 * MapLibre uploads into the native sprite atlas, which takes pixels, so the
 * SVG masters next to the output are the source of record and these PNGs are
 * derived - re-run after editing any of them.
 *
 * Two sizes, for two very different costs:
 *
 * - MAP (128px) goes into MapLibre's sprite atlas, which is one uncompressed
 *   GPU texture holding every registered image. At 512 the 35 icons came to
 *   35 MB of texture - 1.6 MB on disk is no guide, RGBA is 4 bytes a pixel -
 *   and that pinned the UI thread at 0 fps on an iPhone 16 Pro while JS stayed
 *   at 60. At 128 the atlas is 2.2 MB. On-screen size is `MAP_SIZE *
 *   icon-size`, so the layer's multipliers in `screens/home/HomeMap.tsx` are
 *   calibrated against it: change one, change the other.
 *
 * - UI (256px) is loaded on demand by `expo-image` and never reaches the
 *   atlas, so it can afford the detail the 64pt picker thumbnail needs at @3x
 *   (192px). Rendering the picker from the map set would show it upscaled.
 *
 * Do not reach for `qlmanage` here, however tempting it is as a zero-install
 * macOS rasteriser: it composites onto an opaque white background, which is
 * invisible in a thumbnail and ruins every marker on the map.
 */
import sharp from 'sharp';
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** SVG masters, and the map sprites rendered beside them. */
const MAP_DIR = join(import.meta.dir, '../src/assets/images/map/reports');
/** Picker and thumbnail artwork, kept out of `map/` so nothing registers it
 * into the sprite atlas by reflex. */
const UI_DIR = join(import.meta.dir, '../src/assets/images/reports');

const MAP_SIZE = 128;
const UI_SIZE = 256;

const svgs = readdirSync(MAP_DIR)
  .filter((f) => f.endsWith('.svg'))
  .sort();

if (svgs.length === 0) throw new Error(`no SVG masters in ${MAP_DIR}`);

mkdirSync(UI_DIR, { recursive: true });

const render = async (file: string, size: number, outDir: string) => {
  const name = file.slice(0, -'.svg'.length);
  const png = await sharp(join(MAP_DIR, file), { density: size })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  // Guard the exact failure that shipped once: an alpha channel can exist and
  // still be fully opaque if the renderer flattened onto a background.
  const { channels } = await sharp(png).stats();
  if (channels.length < 4 || channels[3].min !== 0) {
    throw new Error(`${name} at ${size}px has no transparent pixels - check the renderer`);
  }

  await Bun.write(join(outDir, `${name}.png`), png);
  return png.length;
};

for (const [size, dir, label] of [
  [MAP_SIZE, MAP_DIR, 'map'],
  [UI_SIZE, UI_DIR, 'ui'],
] as const) {
  let total = 0;
  for (const file of svgs) total += await render(file, size, dir);
  const atlas =
    label === 'map'
      ? ` - ${((svgs.length * size * size * 4) / 1024 / 1024).toFixed(1)} MB of GPU atlas`
      : '';
  console.log(
    `${label}: ${svgs.length} icons at ${size}px, ` +
      `${(total / 1024 / 1024).toFixed(2)} MB on disk${atlas}.`,
  );
}
