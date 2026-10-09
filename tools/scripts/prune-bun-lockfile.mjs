// Nx can't prune bun.lock (generatePackageJson only writes package.json for
// Bun), so build the deploy lockfile ourselves.
//
// Usage: bun tools/scripts/prune-bun-lockfile.mjs dist/apps/<app>
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outputDir = process.argv[2];
if (!outputDir) {
  console.error('Usage: prune-bun-lockfile.mjs <output-dir>');
  process.exit(1);
}

const packageJsonPath = join(outputDir, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const rootPackageJson = JSON.parse(readFileSync('package.json', 'utf8'));

// Workspace libs are bundled into main.js by webpack, and `workspace:*` can't
// resolve outside the monorepo anyway.
for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
  for (const [name, spec] of Object.entries(packageJson[section] ?? {})) {
    if (spec.startsWith('workspace:')) delete packageJson[section][name];
  }
}

// Bun only runs lifecycle scripts of trusted packages (e.g. bcrypt).
packageJson.trustedDependencies = rootPackageJson.trustedDependencies;

writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

// Seeding with the root lockfile makes Bun keep the versions already resolved
// there instead of re-resolving transitive deps from the registry.
copyFileSync('bun.lock', join(outputDir, 'bun.lock'));
execFileSync('bun', ['install', '--lockfile-only'], { cwd: outputDir, stdio: 'inherit' });
