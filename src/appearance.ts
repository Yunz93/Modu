import type { Preferences } from "./model";

export const uiFontFallback =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif';
const serifFallback = 'Georgia, "Songti SC", "Noto Serif SC", serif';

// Sampled from the user's Mozi screenshots; workspace.css confirms the roles.
export const themePalettes = {
  paper: { canvas: "#faf8f4", accent: "#a65f44", selected: "#f2e2d9" },
  night: { canvas: "#24272c", accent: "#d49b7e", selected: "#353d45" },
} as const;

export const accentPresets = [
  { name: "松绿", color: "#3f7654" },
  { name: "雾蓝", color: "#4f7cac" },
  { name: "陶棕", color: "#a65f44" },
  { name: "莓紫", color: "#926486" },
  { name: "琥珀", color: "#b38336" },
];

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
}

export function isFontName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 100 &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function normalizePreferences(preferences: Preferences): Preferences {
  return {
    ...preferences,
    accentColor: isHexColor(preferences.accentColor)
      ? preferences.accentColor.toLowerCase()
      : "",
    uiFontFamily: isFontName(preferences.uiFontFamily)
      ? preferences.uiFontFamily.trim()
      : "",
    readingFontFamily: isFontName(preferences.readingFontFamily)
      ? preferences.readingFontFamily.trim()
      : "",
  };
}

function rgb(hex: string): number[] {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
}

function luminance(hex: string): number {
  const values = rgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

export function contrastRatio(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function mix(color: string, target: number, amount: number): string {
  return (
    "#" +
    rgb(color)
      .map((channel) =>
        Math.round(channel + (target - channel) * amount)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

export function resolveAccent(
  color: string | undefined,
  theme: Preferences["theme"],
): string {
  const palette = themePalettes[theme];
  const base = isHexColor(color) ? color.toLowerCase() : palette.accent;
  // The same user color must remain readable as a link in both modes.
  for (let step = 0; step <= 20; step++) {
    const candidate = mix(base, theme === "night" ? 255 : 0, step / 20);
    if (contrastRatio(candidate, palette.canvas) >= 4.5) return candidate;
  }
  return palette.accent;
}

export function fontFamilyCss(
  name: string | undefined,
  fallback: string,
): string {
  if (!isFontName(name) || !name.trim()) return fallback;
  const escaped = name.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}", ${fallback}`;
}

export function appearanceVariables(
  preferences: Preferences,
): Record<string, string> {
  const values = normalizePreferences(preferences);
  const accent = resolveAccent(values.accentColor, values.theme);
  const darkText = "#231e19";
  const lightText = "#fffaf4";
  return {
    "--accent": accent,
    "--accent-foreground":
      contrastRatio(accent, darkText) > contrastRatio(accent, lightText)
        ? darkText
        : lightText,
    "--focus": accent,
    "--selected": values.accentColor
      ? `color-mix(in srgb, ${accent} ${values.theme === "night" ? 16 : 12}%, ${themePalettes[values.theme].canvas})`
      : themePalettes[values.theme].selected,
    "--ui-font": fontFamilyCss(values.uiFontFamily, uiFontFallback),
    "--reading-font": fontFamilyCss(
      values.readingFontFamily,
      values.font === "sans" ? uiFontFallback : serifFallback,
    ),
    "--list-title-font": values.uiFontFamily
      ? fontFamilyCss(values.uiFontFamily, uiFontFallback)
      : serifFallback,
  };
}

export function applyAppearance(preferences: Preferences): void {
  document.documentElement.dataset.theme = preferences.theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", themePalettes[preferences.theme].canvas);
  for (const [name, value] of Object.entries(
    appearanceVariables(preferences),
  )) {
    document.documentElement.style.setProperty(name, value);
  }
}
