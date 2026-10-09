const useColorConverter = () => {
  // Function to convert HSL to RGB
  const hslToRgb = (hsl: string): { r: number; g: number; b: number } => {
    // Parse HSL string like "hsl(240 10% 3.9%)"
    const match = hsl.match(/hsl\((\d+)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\)/);
    if (!match) {
      console.warn(`Invalid HSL format: ${hsl}. Returning default RGB (0,0,0).`);
      return { r: 0, g: 0, b: 0 }; // Fallback
    }

    const h = parseInt(match[1], 10); // Hue (0-360)
    const s = parseFloat(match[2]) / 100; // Saturation (0-1)
    const l = parseFloat(match[3]) / 100; // Lightness (0-1)

    const c = (1 - Math.abs(2 * l - 1)) * s; // Chroma
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;

    let r = 0,
      g = 0,
      b = 0;
    if (h >= 0 && h < 60) {
      r = c;
      g = x;
      b = 0;
    } else if (h < 120) {
      r = x;
      g = c;
      b = 0;
    } else if (h < 180) {
      r = 0;
      g = c;
      b = x;
    } else if (h < 240) {
      r = 0;
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      g = 0;
      b = c;
    } else if (h < 360) {
      r = c;
      g = 0;
      b = x;
    }

    // Convert to 0-255 range
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    return { r, g, b };
  };

  return { hslToRgb };
};

export default useColorConverter;
