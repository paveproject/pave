import { Icon } from '@expo/ui';

// Native per-platform icons (SF Symbol on iOS, Material Symbol vector
// drawable on Android) - no lucide/SVG involved. `Icon.select` pairs the two
// sources; `@expo/ui/babel-plugin` (auto-loaded by babel-preset-expo) then
// strips the unused side per platform at build time.
//
// Both sides are type-checked: `ios` against the `sf-symbols-typescript`
// union, `android` against `@expo/material-symbols`'s actual exports (a
// typo in either is a compile error, not a runtime surprise).
//
// Render with `@expo/ui`'s own `<Icon name={Icons.key} />`, wrapped in a
// `<Host>` - these are native views, not React components you can nest
// directly into an arbitrary RN layout the way the lucide icons in
// `IconsOld.tsx` are. Brand logos (Google, Facebook, ...) have no native
// equivalent on either platform (only Apple's own logo exists as an SF
// Symbol, iOS-only) and are deliberately left out - they stay in
// `IconsOld.tsx`/`Icons.brands`.
export const Icons = {
  close: Icon.select({ ios: 'xmark', android: import('@expo/material-symbols/close.xml') }),
  check: Icon.select({ ios: 'checkmark', android: import('@expo/material-symbols/check.xml') }),
  plus: Icon.select({ ios: 'plus', android: import('@expo/material-symbols/add.xml') }),
  trash: Icon.select({ ios: 'trash', android: import('@expo/material-symbols/delete.xml') }),
  edit: Icon.select({ ios: 'pencil', android: import('@expo/material-symbols/edit.xml') }),

  mail: Icon.select({ ios: 'envelope', android: import('@expo/material-symbols/mail.xml') }),
  lock: Icon.select({ ios: 'lock', android: import('@expo/material-symbols/lock.xml') }),
  eye: Icon.select({ ios: 'eye', android: import('@expo/material-symbols/visibility.xml') }),
  eyeOff: Icon.select({
    ios: 'eye.slash',
    android: import('@expo/material-symbols/visibility_off.xml'),
  }),
  user: Icon.select({ ios: 'person', android: import('@expo/material-symbols/person.xml') }),
  people: Icon.select({
    ios: 'person.2',
    android: import('@expo/material-symbols/group.xml'),
  }),
  peopleOff: Icon.select({
    ios: 'person.2.slash',
    android: import('@expo/material-symbols/group_off.xml'),
  }),

  chevronLeft: Icon.select({
    ios: 'chevron.left',
    android: import('@expo/material-symbols/chevron_left.xml'),
  }),
  chevronRight: Icon.select({
    ios: 'chevron.right',
    android: import('@expo/material-symbols/chevron_right.xml'),
  }),
  chevronUp: Icon.select({
    ios: 'chevron.up',
    android: import('@expo/material-symbols/keyboard_arrow_up.xml'),
  }),
  chevronDown: Icon.select({
    ios: 'chevron.down',
    android: import('@expo/material-symbols/keyboard_arrow_down.xml'),
  }),
  ellipsis: Icon.select({
    ios: 'ellipsis',
    android: import('@expo/material-symbols/more_horiz.xml'),
  }),

  search: Icon.select({
    ios: 'magnifyingglass',
    android: import('@expo/material-symbols/search.xml'),
  }),
  settings: Icon.select({
    ios: 'gearshape',
    android: import('@expo/material-symbols/settings.xml'),
  }),
  appearance: Icon.select({
    ios: 'circle.lefthalf.filled',
    android: import('@expo/material-symbols/contrast.xml'),
  }),
  device: Icon.select({
    ios: 'iphone',
    android: import('@expo/material-symbols/devices.xml'),
  }),
  language: Icon.select({
    ios: 'globe',
    android: import('@expo/material-symbols/language.xml'),
  }),
  signOut: Icon.select({
    ios: 'rectangle.portrait.and.arrow.right',
    android: import('@expo/material-symbols/logout.xml'),
  }),
  home: Icon.select({ ios: 'house', android: import('@expo/material-symbols/home.xml') }),
  bell: Icon.select({
    ios: 'bell',
    android: import('@expo/material-symbols/notifications.xml'),
  }),
  menu: Icon.select({
    ios: 'line.3.horizontal',
    android: import('@expo/material-symbols/menu.xml'),
  }),
  info: Icon.select({
    ios: 'info.circle',
    android: import('@expo/material-symbols/info.xml'),
  }),
  link: Icon.select({ ios: 'link', android: import('@expo/material-symbols/link.xml') }),
  clock: Icon.select({ ios: 'clock', android: import('@expo/material-symbols/schedule.xml') }),
  megaphone: Icon.select({
    ios: 'megaphone',
    android: import('@expo/material-symbols/campaign.xml'),
  }),
  calendar: Icon.select({
    ios: 'calendar',
    android: import('@expo/material-symbols/calendar_month.xml'),
  }),

  star: Icon.select({ ios: 'star', android: import('@expo/material-symbols/star.xml') }),
  heart: Icon.select({
    ios: 'heart',
    android: import('@expo/material-symbols/favorite.xml'),
  }),
  bookmark: Icon.select({
    ios: 'bookmark',
    android: import('@expo/material-symbols/bookmark.xml'),
  }),
  share: Icon.select({
    ios: 'square.and.arrow.up',
    android: import('@expo/material-symbols/share.xml'),
  }),
  copy: Icon.select({
    ios: 'doc.on.doc',
    android: import('@expo/material-symbols/content_copy.xml'),
  }),
  camera: Icon.select({
    ios: 'camera',
    android: import('@expo/material-symbols/photo_camera.xml'),
  }),
  download: Icon.select({
    ios: 'arrow.down.to.line',
    android: import('@expo/material-symbols/download.xml'),
  }),
  refresh: Icon.select({
    ios: 'arrow.clockwise',
    android: import('@expo/material-symbols/refresh.xml'),
  }),
  warning: Icon.select({
    ios: 'exclamationmark.triangle.fill',
    android: import('@expo/material-symbols/warning.xml'),
  }),
  bluetooth: Icon.select({
    ios: 'dot.radiowaves.left.and.right',
    android: import('@expo/material-symbols/bluetooth.xml'),
  }),
  shield: Icon.select({
    ios: 'lock.shield',
    android: import('@expo/material-symbols/shield.xml'),
  }),
  error: Icon.select({
    ios: 'exclamationmark.octagon.fill',
    android: import('@expo/material-symbols/error.xml'),
  }),

  // Reframes a map on everything it has to show, which is not "locate me" -
  // hence its own icon rather than one of the three below.
  fitBounds: Icon.select({
    ios: 'viewfinder',
    android: import('@expo/material-symbols/crop_free.xml'),
  }),
  // Map locate button's 3 states (idle -> focused -> heading-follow).
  locate: Icon.select({
    ios: 'location',
    android: import('@expo/material-symbols/location_searching.xml'),
  }),
  locateFocused: Icon.select({
    ios: 'location.fill',
    android: import('@expo/material-symbols/my_location.xml'),
  }),
  locateHeading: Icon.select({
    ios: 'location.north.line.fill',
    android: import('@expo/material-symbols/navigation.xml'),
  }),
  locateUnavailable: Icon.select({
    ios: 'location.slash',
    android: import('@expo/material-symbols/location_disabled.xml'),
  }),
  microphone: Icon.select({ ios: 'mic', android: import('@expo/material-symbols/mic.xml') }),
  waveform: Icon.select({
    ios: 'waveform',
    android: import('@expo/material-symbols/graphic_eq.xml'),
  }),
  video: Icon.select({
    ios: 'video',
    android: import('@expo/material-symbols/videocam.xml'),
  }),

  play: Icon.select({
    ios: 'play.fill',
    android: import('@expo/material-symbols/play_arrow.xml'),
  }),
  pause: Icon.select({ ios: 'pause.fill', android: import('@expo/material-symbols/pause.xml') }),
  // SF puts the number in the glyph; Material Symbols has 5, 10 and 30 but no
  // 15, so Android gets a bare arrow and the amount lives in the
  // accessibility label. 10s would match exactly on both.
  skipBack: Icon.select({
    ios: 'gobackward.15',
    android: import('@expo/material-symbols/rotate_left.xml'),
  }),
  skipForward: Icon.select({
    ios: 'goforward.15',
    android: import('@expo/material-symbols/rotate_right.xml'),
  }),
};

export type IconKey = keyof typeof Icons;
