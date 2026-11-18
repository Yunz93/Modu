import type { Preferences } from "./model";

export const uiFontFallback =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", sans-serif';
export const codeFontFallback = '"SFMono-Regular", Consolas, monospace';
const serifFallback = 'Georgia, "Songti SC", "Noto Serif SC", serif';

// Sampled from the user's Mozi screenshots; workspace.css confirms the roles.
export const themePalettes = {
  paper: { canvas: "#faf8f4", accent: "#a65f44", selected: "#f2e2d9" },
  night: { canvas: "#24272c", accent: "#d49b7e", selected: "#353d45" },
} as const;

export const accentPresets = [
  { name: "默认", color: "" },
  { name: "蓝色", color: "#3b82f6" },
  { name: "绿色", color: "#22a06b" },
  { name: "紫色", color: "#8b5cf6" },
  { name: "玫瑰色", color: "#db6480" },
];

export const uiFontSizes = { min: 12, max: 22, default: 16 };

export const readingFontPresets = [
  {
    label: "仓耳今楷 04",
    family: "TsangerJinKai02 W04",
    aliases: [
      "TsangerJinKai02-W04",
      "TsangerJinKai02",
      "Tsanger JinKai 02",
      "仓耳今楷02 W04",
      "仓耳今楷 W04",
      "仓耳今楷02",
    ],
  },
  {
    label: "京华老宋",
    family: "KingHwa OldSong",
    aliases: [
      "KingHwa_OldSong",
      "京華老宋体",
      "京華老宋體",
      "京华老宋体",
      "京華老宋",
      "京华老宋",
    ],
  },
];

export function readingFontPreset(family?: string) {
  const value = family?.toLowerCase();
  return readingFontPresets.find((preset) =>
    [preset.family, ...preset.aliases].some((name) => name.toLowerCase() === value),
  );
}

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
  const uiFontSize = preferences.uiFontSize ?? uiFontSizes.default;
  return {
    ...preferences,
    locale: preferences.locale === "en" ? "en" : "zh-CN",
    followSystemTheme: preferences.followSystemTheme === true,
    uiFontSize: Number.isInteger(uiFontSize) &&
      uiFontSize >= uiFontSizes.min && uiFontSize <= uiFontSizes.max
      ? preferences.uiFontSize
      : undefined,
    narrowReading: preferences.narrowReading === true,
    markReadOnOpen: preferences.markReadOnOpen !== false,
    codeFontFamily: isFontName(preferences.codeFontFamily)
      ? preferences.codeFontFamily.trim()
      : "",
    singleKeyShortcuts: preferences.singleKeyShortcuts !== false,
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

export function effectiveAppearance(
  preferences: Preferences,
  systemDark: boolean,
): Preferences["theme"] {
  return preferences.followSystemTheme
    ? systemDark
      ? "night"
      : "paper"
    : preferences.theme;
}

export function appearanceVariables(
  preferences: Preferences,
  theme = preferences.theme,
): Record<string, string> {
  const values = normalizePreferences(preferences);
  const accent = resolveAccent(values.accentColor, theme);
  const darkText = "#231e19";
  const lightText = "#fffaf4";
  const readingFallback = values.font === "sans" ? uiFontFallback : serifFallback;
  const readingPreset = readingFontPreset(values.readingFontFamily);
  const readingFont = readingPreset
    ? [readingPreset.family, ...readingPreset.aliases].reduceRight(
        (fallback, name) => fontFamilyCss(name, fallback),
        readingFallback,
      )
    : fontFamilyCss(values.readingFontFamily, readingFallback);
  return {
    "--accent": accent,
    "--accent-foreground":
      contrastRatio(accent, darkText) > contrastRatio(accent, lightText)
        ? darkText
        : lightText,
    "--focus": accent,
    "--selected": values.accentColor
      ? `color-mix(in srgb, ${accent} ${theme === "night" ? 16 : 12}%, ${themePalettes[theme].canvas})`
      : themePalettes[theme].selected,
    "--ui-size-offset": `${(values.uiFontSize ?? uiFontSizes.default) - uiFontSizes.default}px`,
    "--reading-width": values.narrowReading ? "740px" : "1000px",
    "--code-font": fontFamilyCss(values.codeFontFamily, codeFontFallback),
    "--ui-font": fontFamilyCss(values.uiFontFamily, uiFontFallback),
    "--reading-font": readingFont,
    "--list-title-font": values.uiFontFamily
      ? fontFamilyCss(values.uiFontFamily, uiFontFallback)
      : serifFallback,
  };
}

export function applyAppearance(
  preferences: Preferences,
  theme = preferences.theme,
): void {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", themePalettes[theme].canvas);
  for (const [name, value] of Object.entries(
    appearanceVariables(preferences, theme),
  )) {
    document.documentElement.style.setProperty(name, value);
  }
}
