import { useTranslation } from "./locale-context";
import { useEffect, useId, useRef, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { isFontName, readingFontPreset, readingFontPresets } from "./appearance";
import { desktop, native } from "./desktop";
import type { Preferences } from "./model";
import { fontSizes, type FontSizeRange } from "./font-sizes";

const commonFonts = [
  "Arial", "Avenir Next", "Georgia", "Heiti SC", "Helvetica Neue",
  "Kaiti SC", "PingFang SC", "Songti SC", "Times New Roman",
];
const manualOption = "\u0001";
const systemSerif = "Songti SC";

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

type FontSizeFieldProps = {
  label: string;
  range: FontSizeRange;
  value: number;
  onChange: (size: number) => void;
};

export function FontSizeField({ label, range, value, onChange }: FontSizeFieldProps) {
  const id = useId();
  return (
    <div className="setting-field">
      <div className="setting-range-heading">
        <label className="setting-label" htmlFor={id}>{label}</label>
        <output htmlFor={id} aria-hidden="true">{value} px</output>
      </div>
      <input
        className="setting-range"
        id={id}
        type="range"
        min={range.min}
        max={range.max}
        step={fontSizes.step}
        value={value}
        aria-valuetext={`${value} px`}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
      />
    </div>
  );
}

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
      <div className="setting-field">
        <FontFamilyField
          label={t("阅读字体")}
          defaultLabel={t("系统默认字体")}
          value={storedFamily ?? ""}
          fonts={fonts.names.filter((name) => name !== systemSerif && !readingFontPreset(name))}
          presets={[
            { value: systemSerif, label: t("系统宋体") },
            ...readingFontPresets.map(({ family, label }) => ({ value: family, label: t(label) })),
          ]}
          onChange={(readingFontFamily) => {
            onChange({ font: readingFontFamily === systemSerif ? "serif" : "sans", readingFontFamily });
          }}
        />
        {missing && (
          <p className="setting-hint" role="status">{t("本机尚未安装 {0}，暂用系统字体。", [t(preset.label)])}</p>
        )}
      </div>
      {!compact && (
        <div>
          <label className="settings-row">
            <span>
              {t("正文行宽")}<small>{t("窄版在宽窗口中缩短每行文字。")}</small>
            </span>
            <select
              value={preferences.narrowReading ? "narrow" : "standard"}
              onChange={(event) =>
                onChange({
                  narrowReading: event.target.value === "narrow",
                })
              }
            >
              <option value="standard">{t("标准")}</option>
              <option value="narrow">{t("窄版")}</option>
            </select>
          </label>
          <label className="settings-row">
            <span>
              {t("打开文章时标为已读")}
              <small>{t("关闭后可在正文底部手动标为已读。")}</small>
            </span>
            <input
              type="checkbox"
              checked={preferences.markReadOnOpen !== false}
              onChange={(event) =>
                onChange({ markReadOnOpen: event.target.checked })
              }
            />
          </label>
        </div>
      )}
      <FontSizeField
        label={t("正文字号")}
        range={fontSizes}
        value={preferences.fontSize}
        onChange={(fontSize) => onChange({ fontSize })}
      />
    </div>
  );
}
