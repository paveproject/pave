import type { ImageRequireSource } from 'react-native';
import type { ReportFamily, ReportTypeKey } from '@libs/constants';

/**
 * Bitmaps, not the SVG masters next to them: MapLibre uploads into the native
 * sprite atlas, which takes pixels. `require` rather than a native asset name
 * (xcassets / drawable) for two reasons - those live in gitignored prebuild
 * output and vanish on `expo prebuild --clean`, and they can't ship in an OTA.
 *
 * Statically listed because Metro cannot resolve a computed `require`, and
 * generated from the taxonomy so the list can't drift from it. The PNGs are
 * currently 24x24 renders of the *flat* set, so they upscale badly - dropping
 * better files in at the same paths (plus `name@2x.png` / `name@3x.png`, which
 * Metro picks up by device density) needs no change here.
 */
const reportIcons = {
  tear_gas: require('../assets/images/reports/tear_gas.png') as ImageRequireSource,
  police_presence: require('../assets/images/reports/police_presence.png') as ImageRequireSource,
  arrest: require('../assets/images/reports/arrest.png') as ImageRequireSource,
  violence: require('../assets/images/reports/violence.png') as ImageRequireSource,
  road_block: require('../assets/images/reports/road_block.png') as ImageRequireSource,
  medical: require('../assets/images/reports/medical.png') as ImageRequireSource,
  water_cannon: require('../assets/images/reports/water_cannon.png') as ImageRequireSource,
  kettling: require('../assets/images/reports/kettling.png') as ImageRequireSource,
  other: require('../assets/images/reports/other.png') as ImageRequireSource,
  stun_grenade: require('../assets/images/reports/stun_grenade.png') as ImageRequireSource,
  kinetic_rounds: require('../assets/images/reports/kinetic_rounds.png') as ImageRequireSource,
  live_ammunition: require('../assets/images/reports/live_ammunition.png') as ImageRequireSource,
  pepper_spray: require('../assets/images/reports/pepper_spray.png') as ImageRequireSource,
  baton_charge: require('../assets/images/reports/baton_charge.png') as ImageRequireSource,
  mounted_police: require('../assets/images/reports/mounted_police.png') as ImageRequireSource,
  vehicle_ramming: require('../assets/images/reports/vehicle_ramming.png') as ImageRequireSource,
  military_presence:
    require('../assets/images/reports/military_presence.png') as ImageRequireSource,
  checkpoint: require('../assets/images/reports/checkpoint.png') as ImageRequireSource,
  abduction: require('../assets/images/reports/abduction.png') as ImageRequireSource,
  riot_police: require('../assets/images/reports/riot_police.png') as ImageRequireSource,
  fire: require('../assets/images/reports/fire.png') as ImageRequireSource,
  transit_closed: require('../assets/images/reports/transit_closed.png') as ImageRequireSource,
  exit_blocked: require('../assets/images/reports/exit_blocked.png') as ImageRequireSource,
  safe_route: require('../assets/images/reports/safe_route.png') as ImageRequireSource,
  legal_support: require('../assets/images/reports/legal_support.png') as ImageRequireSource,
  water_supply: require('../assets/images/reports/water_supply.png') as ImageRequireSource,
  internet_shutdown:
    require('../assets/images/reports/internet_shutdown.png') as ImageRequireSource,
  surveillance: require('../assets/images/reports/surveillance.png') as ImageRequireSource,
  press_targeted: require('../assets/images/reports/press_targeted.png') as ImageRequireSource,
} satisfies Record<ReportTypeKey, ImageRequireSource>;

/**
 * Families carry the cluster marker, where 29 distinct pictograms would just
 * be noise.
 */
const reportFamilyIcons = {
  force_used: require('../assets/images/reports/family_force_used.png') as ImageRequireSource,
  presence: require('../assets/images/reports/family_presence.png') as ImageRequireSource,
  movement: require('../assets/images/reports/family_movement.png') as ImageRequireSource,
  aid: require('../assets/images/reports/family_aid.png') as ImageRequireSource,
  surveillance: require('../assets/images/reports/family_surveillance.png') as ImageRequireSource,
  other: require('../assets/images/reports/family_other.png') as ImageRequireSource,
} satisfies Record<ReportFamily, ImageRequireSource>;

/** Exhaustive by construction, so indexing needs no fallback. */
export const reportIcon = (type: ReportTypeKey): ImageRequireSource => reportIcons[type];

export const reportFamilyIcon = (family: ReportFamily): ImageRequireSource =>
  reportFamilyIcons[family];

/**
 * The 128px set, and the only one MapLibre registers. Every image handed to
 * `<Images>` is packed into a single uncompressed GPU texture, so size here is
 * paid in VRAM, not disk: the 512px artwork this started as came to 35 MB of
 * atlas and held the UI thread at 0 fps. The picker uses `reportIcon` instead,
 * which is the larger set and never touches the atlas.
 *
 * Families are prefixed because `other` is a key at both levels, so a flat
 * merge would silently drop one of them - and the prefix matches the PNG
 * filenames, so a missing sprite is findable.
 */
export const mapSprites: Record<string, ImageRequireSource> = {
  tear_gas: require('../assets/images/map/reports/tear_gas.png') as ImageRequireSource,
  police_presence:
    require('../assets/images/map/reports/police_presence.png') as ImageRequireSource,
  arrest: require('../assets/images/map/reports/arrest.png') as ImageRequireSource,
  violence: require('../assets/images/map/reports/violence.png') as ImageRequireSource,
  road_block: require('../assets/images/map/reports/road_block.png') as ImageRequireSource,
  medical: require('../assets/images/map/reports/medical.png') as ImageRequireSource,
  water_cannon: require('../assets/images/map/reports/water_cannon.png') as ImageRequireSource,
  kettling: require('../assets/images/map/reports/kettling.png') as ImageRequireSource,
  other: require('../assets/images/map/reports/other.png') as ImageRequireSource,
  stun_grenade: require('../assets/images/map/reports/stun_grenade.png') as ImageRequireSource,
  kinetic_rounds: require('../assets/images/map/reports/kinetic_rounds.png') as ImageRequireSource,
  live_ammunition:
    require('../assets/images/map/reports/live_ammunition.png') as ImageRequireSource,
  pepper_spray: require('../assets/images/map/reports/pepper_spray.png') as ImageRequireSource,
  baton_charge: require('../assets/images/map/reports/baton_charge.png') as ImageRequireSource,
  mounted_police: require('../assets/images/map/reports/mounted_police.png') as ImageRequireSource,
  vehicle_ramming:
    require('../assets/images/map/reports/vehicle_ramming.png') as ImageRequireSource,
  military_presence:
    require('../assets/images/map/reports/military_presence.png') as ImageRequireSource,
  checkpoint: require('../assets/images/map/reports/checkpoint.png') as ImageRequireSource,
  abduction: require('../assets/images/map/reports/abduction.png') as ImageRequireSource,
  riot_police: require('../assets/images/map/reports/riot_police.png') as ImageRequireSource,
  fire: require('../assets/images/map/reports/fire.png') as ImageRequireSource,
  transit_closed: require('../assets/images/map/reports/transit_closed.png') as ImageRequireSource,
  exit_blocked: require('../assets/images/map/reports/exit_blocked.png') as ImageRequireSource,
  safe_route: require('../assets/images/map/reports/safe_route.png') as ImageRequireSource,
  legal_support: require('../assets/images/map/reports/legal_support.png') as ImageRequireSource,
  water_supply: require('../assets/images/map/reports/water_supply.png') as ImageRequireSource,
  internet_shutdown:
    require('../assets/images/map/reports/internet_shutdown.png') as ImageRequireSource,
  surveillance: require('../assets/images/map/reports/surveillance.png') as ImageRequireSource,
  press_targeted: require('../assets/images/map/reports/press_targeted.png') as ImageRequireSource,
  family_force_used:
    require('../assets/images/map/reports/family_force_used.png') as ImageRequireSource,
  family_presence:
    require('../assets/images/map/reports/family_presence.png') as ImageRequireSource,
  family_movement:
    require('../assets/images/map/reports/family_movement.png') as ImageRequireSource,
  family_aid: require('../assets/images/map/reports/family_aid.png') as ImageRequireSource,
  family_surveillance:
    require('../assets/images/map/reports/family_surveillance.png') as ImageRequireSource,
  family_other: require('../assets/images/map/reports/family_other.png') as ImageRequireSource,
};

/**
 * Cluster severity tiers - how "bad" a cluster looks scales with how many
 * reports it bundles, not just a plain count label. Flat-color stand-ins
 * for now (see `src/assets/images/map/reports/`); swap each file for real
 * artwork (smoke, crowds, collapsing buildings, ...) later without
 * touching `screens/home/HomeMap.tsx` - it only reads these names.
 */
export type ClusterSeverity = 'low' | 'medium' | 'high' | 'extreme';

export const Assets = {
  reports: reportIcons,
  reportFamilies: reportFamilyIcons,
  clusterSeverity: {
    low: 'map_reports_cluster_low',
    medium: 'map_reports_cluster_medium',
    high: 'map_reports_cluster_high',
    extreme: 'map_reports_cluster_extreme',
  } satisfies Record<ClusterSeverity, string>,
};
