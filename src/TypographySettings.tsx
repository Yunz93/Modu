import { useTranslation } from "./locale-context";
import { useEffect, useId, useRef, useState } from "react";
import { CaretDownIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react";
import { isFontName, readingFontPreset, readingFontPresets } from "./appearance";
import { desktop, native } from "./desktop";
import type { Preferences } from "./model";

const commonFonts = [
  "Arial", "Avenir Next", "Georgia", "Heiti SC", "Helvetica Neue",
  "Kaiti SC", "PingFang SC", "Songti SC", "Times New Roman",
];
const manualOption = "\u0001";
const sansOption = "\u0002";

export function useFontChoices(open: boolean) {
  const [installed, setInstalled] = useState<string[] | null>(null);
  useEffect(() => {
    if (!desktop || !open) return;
    let active = true;
    void native.fonts().then((installed) => {
      if (active && installed.length) setInstalled(installed);
    }).catch(() => {
      // Common suggestions and manual input remain available.
    });
    return () => { active = false; };
  }, [open]);
  return { names: installed ?? commonFonts, installed };
}

type FontFieldProps = {
  label: string;
  defaultLabel: string;
  value?: string;
  fonts: string[];
  presets?: { value: string; label: string }[];
  onChange: (name: string) => void;
};

export function FontFamilyField({
  label, defaultLabel, value = "", fonts, presets = [], onChange,
}: FontFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const select = useRef<HTMLSelectElement>(null);
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const listed = fonts.includes(value) || presets.some((preset) => preset.value === value);
  return (
    <div className="setting-field">
      <label className="setting-label" htmlFor={id}>{label}</label>
      <div className="setting-select-wrap">
        <select
          ref={select}
          id={id}
          className="setting-select"
          value={manual ? manualOption : value}
          onChange={(event) => {
            const name = event.target.value;
            setManual(name === manualOption);
            setError("");
            if (name === manualOption) setDraft(isFontName(value) ? value : "");
            else onChange(name);
          }}
        >
          <option value="">{defaultLabel}</option>
          {presets.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          {value && !listed && <option value={value}>{value}</option>}
          {fonts.map((name) => <option key={name} value={name}>{name}</option>)}
          <option value={manualOption}>{t("手动输入…")}</option>
        </select>
        <CaretDownIcon size={16} aria-hidden="true" />
      </div>
      {manual && (
        <form
          className="manual-font"
          onSubmit={(event) => {
            event.preventDefault();
            if (!isFontName(draft)) {
              setError(t("请输入 100 个字符内的字体名称。"));
              return;
            }
            onChange(draft.trim());
            setManual(false);
            select.current?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" &&
              (event.nativeEvent.isComposing || event.keyCode === 229)
            ) event.preventDefault();
          }}
        >
          <input
            className="setting-select"
            aria-label={t("{0}名称", [label])}
            placeholder={t("已安装的字体名称")}
            value={draft}
            onChange={(event) => { setDraft(event.target.value); setError(""); }}
            maxLength={100}
            autoComplete="off"
          />
          <button type="submit" className="primary-button">{t("应用")}</button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
}

type ReadingProps = {
  preferences: Preferences;
  fonts: ReturnType<typeof useFontChoices>;
  onChange: (patch: Partial<Preferences>) => void;
  compact?: boolean;
};

export function ReadingSettings({
  preferences, fonts, onChange, compact = false,
}: ReadingProps) {
  const { t } = useTranslation();
  const preset = readingFontPreset(preferences.readingFontFamily);
  const storedFamily = preset?.family ?? preferences.readingFontFamily;
  const missing = preset && fonts.installed &&
    !fonts.installed.some((family) => readingFontPreset(family) === preset);
  return (
    <div className="reading-settings">
      {compact && <h3>{t("阅读外观")}</h3>}
      <div className="setting-field">
        <FontFamilyField
          label={t("阅读字体")}
          defaultLabel={t("系统宋体")}
          value={storedFamily || (preferences.font === "sans" ? sansOption : "")}
          fonts={fonts.names.filter((name) => !readingFontPreset(name))}
          presets={[
            { value: sansOption, label: t("系统黑体") },
            ...readingFontPresets.map(({ family, label }) => ({ value: family, label: t(label) })),
          ]}
          onChange={(readingFontFamily) => {
            if (readingFontFamily === "" || readingFontFamily === sansOption) {
              onChange({ font: readingFontFamily === sansOption ? "sans" : "serif", readingFontFamily: "" });
            } else {
              onChange({ readingFontFamily });
            }
          }}
        />
        {missing && (
          <p className="setting-hint" role="status">{t("本机尚未安装 {0}，暂用系统字体。", [t(preset.label)])}</p>
        )}
      </div>
      <div className="appearance-row">
        <span>{t("正文字号")}</span>
        <div className="stepper">
          <button
            className="icon-button"
            aria-label={t("缩小正文字号")}
            disabled={preferences.fontSize <= 16}
            onClick={() => onChange({ fontSize: preferences.fontSize - 1 })}
          >
            <MinusIcon size={17} />
          </button>
          <output aria-label={t("正文字号")}>{preferences.fontSize}</output>
          <button
            className="icon-button"
            aria-label={t("放大正文字号")}
            disabled={preferences.fontSize >= 28}
            onClick={() => onChange({ fontSize: preferences.fontSize + 1 })}
          >
            <PlusIcon size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
