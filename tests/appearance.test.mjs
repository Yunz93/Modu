import test from "node:test";
import assert from "node:assert/strict";
import {
  appearanceVariables,
  contrastRatio,
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
