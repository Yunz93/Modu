import test from "node:test";
import assert from "node:assert/strict";
import {
  appearanceVariables,
  contrastRatio,
  effectiveAppearance,
  fontFamilyCss,
  normalizePreferences,
  resolveAccent,
  themePalettes,
  uiFontFallback,
} from "../src/appearance.ts";

const preferences = { fontSize: 23, font: "serif", theme: "paper" };

test("legacy appearance settings gain optional fields without resetting existing choices", () => {
  const previous = { fontSize: 26, font: "sans", theme: "night" };
  const result = normalizePreferences(previous);
  assert.deepEqual(result, {
    ...previous,
    accentColor: "",
    followSystemTheme: false,
    uiFontSize: undefined,
    narrowReading: false,
    markReadOnOpen: true,
    codeFontFamily: "",
    singleKeyShortcuts: true,
    uiFontFamily: "",
    readingFontFamily: "",
  });
  assert.deepEqual(normalizePreferences(result), result);
});

test("default accent and selection match the user-provided Mozi reference", () => {
  const night = appearanceVariables({ ...preferences, theme: "night" });
  assert.equal(themePalettes.night.canvas, "#24272c");
  assert.equal(themePalettes.paper.canvas, "#faf8f4");
  assert.equal(night["--accent"], "#d49b7e");
  assert.equal(night["--selected"], "#353d45");
  assert.equal(appearanceVariables(preferences)["--accent"], "#a65f44");
});

test("custom colors remain readable as text and as filled controls in either mode", () => {
  for (const theme of ["paper", "night"]) {
    for (const accentColor of [
      "#ffffff",
      "#000000",
      "#ffff00",
      "#3f7654",
      "#4f7cac",
      "#926486",
      "#ff0000",
    ]) {
      const appearance = appearanceVariables({
        ...preferences,
        theme,
        accentColor,
      });
      assert.ok(
        contrastRatio(appearance["--accent"], themePalettes[theme].canvas) >=
          4.5,
      );
      assert.ok(
        contrastRatio(
          appearance["--accent"],
          appearance["--accent-foreground"],
        ) >= 4.5,
      );
    }
  }
  assert.equal(resolveAccent("not-a-color", "night"), "#d49b7e");
});

test("custom font names are quoted and keep system fallback rather than injecting CSS", () => {
  const result = appearanceVariables({
    ...preferences,
    uiFontFamily: "Avenir Next",
    readingFontFamily: "Kaiti SC",
  });
  assert.ok(result["--ui-font"].startsWith('"Avenir Next",'));
  assert.ok(result["--reading-font"].startsWith('"Kaiti SC",'));
  assert.equal(fontFamilyCss("", uiFontFallback), uiFontFallback);
  assert.equal(fontFamilyCss("bad\nname", uiFontFallback), uiFontFallback);
  assert.ok(
    fontFamilyCss('A "quoted" name', uiFontFallback).startsWith(
      '"A \\"quoted\\" name",',
    ),
  );
});

test("system appearance resolves its palette without overwriting a manual choice", () => {
  const values = normalizePreferences({
    ...preferences,
    followSystemTheme: true,
  });
  assert.equal(effectiveAppearance(values, false), "paper");
  assert.equal(effectiveAppearance(values, true), "night");
  assert.equal(
    appearanceVariables(values, effectiveAppearance(values, true))["--accent"],
    "#d49b7e",
  );
  assert.equal(values.theme, "paper");
  assert.equal(
    effectiveAppearance({ ...values, followSystemTheme: false }, true),
    "paper",
  );
});

test("reading and interface settings retain their own values and reject invalid presentation input", () => {
  const values = normalizePreferences({
    ...preferences,
    uiFontSize: 20,
    narrowReading: true,
    codeFontFamily: " Menlo ",
    markReadOnOpen: false,
    singleKeyShortcuts: false,
  });
  const css = appearanceVariables(values);
  assert.equal(css["--ui-size-offset"], "4px");
  assert.equal(css["--reading-width"], "740px");
  assert.match(css["--code-font"], /^"Menlo",/);
  assert.equal(values.fontSize, preferences.fontSize);
  assert.equal(values.markReadOnOpen, false);
  assert.equal(values.singleKeyShortcuts, false);
  const bad = appearanceVariables({
    ...preferences,
    uiFontSize: 200,
    codeFontFamily: "bad\nname",
  });
  assert.equal(bad["--ui-size-offset"], "0px");
  assert.match(bad["--code-font"], /^"SFMono-Regular",/);
});
