import fontSizes from "./font-sizes.json" with { type: "json" };

export { fontSizes };
export type FontSizeRange = Pick<typeof fontSizes, "min" | "max">;
export const storedUiSizeRange = { min: fontSizes.min, max: fontSizes.legacyUiMax };
export const storedReadingSizeRange = { min: fontSizes.min, max: fontSizes.legacyReadingMax };

export function isFontSizeInRange(value: unknown, range: FontSizeRange): value is number {
  return typeof value === "number" && Number.isFinite(value)
    && value >= range.min && value <= range.max;
}
