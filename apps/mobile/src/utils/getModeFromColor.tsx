import Color from 'color';

export const getModeFromColor = (hsl: string): 'light' | 'dark' => {
  const c = Color(hsl);
  return c.isLight() ? 'light' : 'dark';
};
