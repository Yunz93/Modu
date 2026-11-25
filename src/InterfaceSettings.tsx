import { useTranslation } from "./locale-context";
import { useId } from "react";
import { CaretDownIcon, EyedropperIcon } from "@phosphor-icons/react";
import { accentPresets, themePalettes } from "./appearance";
import { desktop } from "./desktop";
import type { Preferences } from "./model";
import { FontFamilyField, FontSizeField } from "./TypographySettings";
import { fontSizes } from "./font-sizes";

type Props = {
  preferences: Preferences;
  effectiveTheme: Preferences["theme"];
  fonts: string[];
  onChange: (patch: Partial<Preferences>) => void;
};

const themes = [
  { id: "paper", label: "浅色" },
  { id: "night", label: "深色" },
  { id: "system", label: "跟随系统" },
] as const;

export function InterfaceSettings({ preferences, effectiveTheme, fonts, onChange }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const selectedTheme = preferences.followSystemTheme ? "system" : preferences.theme;
  const accent = preferences.accentColor ?? "";
  const defaultAccent = themePalettes[effectiveTheme].accent;
  const selectedAccent = accentPresets.find(({ color }) => color === accent);

  return (
    <div className="interface-settings">
      <div className="setting-field">
        <label className="setting-label" htmlFor={`${id}-locale`}>{t("显示语言")}</label>
        <div className="setting-select-wrap">
          <select
            className="setting-select"
            id={`${id}-locale`}
            value={preferences.locale ?? "zh-CN"}
            onChange={(event) => onChange({ locale: event.target.value === "en" ? "en" : "zh-CN" })}
          >
            <option value="zh-CN" lang="zh-CN">简体中文</option>
            <option value="en" lang="en">English</option>
          </select>
          <CaretDownIcon size={16} aria-hidden="true" />
        </div>
        <p className="setting-hint">{t("切换应用界面的显示语言。")}</p>
      </div>
      <div className="setting-field">
        <p className="setting-label" id={`${id}-theme`}>{t("外观主题")}</p>
        <div className="theme-options" role="group" aria-labelledby={`${id}-theme`}>
          {themes.map(({ id: theme, label }) => (
            <button
              key={theme}
              className="setting-choice"
              aria-pressed={selectedTheme === theme}
              onClick={() => onChange(theme === "system"
                ? { followSystemTheme: true }
                : { theme, followSystemTheme: false })}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <p className="setting-hint">{t("选择浅色或深色主题，或随系统外观自动切换。")}</p>
      </div>
      <div className="setting-field">
        <p className="setting-label accent-label">
          <span id={`${id}-accent`}>{t("主题色")}</span>
          <span className="accent-value">{t(selectedAccent?.name ?? "自定义")}</span>
        </p>
        <div className="accent-options" role="group" aria-labelledby={`${id}-accent`}>
          <div className="accent-presets">
            {accentPresets.map(({ name, color }) => (
              <button
                key={name}
                className="accent-swatch"
                aria-label={t(name)}
                aria-pressed={accent === color}
                title={t(name)}
                onClick={() => onChange({ accentColor: color })}
              >
                <span className="accent-dot" style={{ background: color || defaultAccent }} aria-hidden="true" />
              </button>
            ))}
          </div>
          <label className={`setting-choice custom-accent${selectedAccent ? "" : " is-selected"}`}>
            {!selectedAccent
              ? <span className="accent-dot" style={{ background: accent }} aria-hidden="true" />
              : <EyedropperIcon size={16} aria-hidden="true" />}
            {t("自定义")}
            <input
              type="color"
              aria-label={t("自定义主题色")}
              value={accent || defaultAccent}
              onChange={(event) => onChange({ accentColor: event.target.value })}
            />
          </label>
        </div>
        <p className="setting-hint">{t("用于选中状态、按钮和链接，随外观调整对比度。")}</p>
      </div>
      <div className="setting-field">
        <FontFamilyField
          label={t("UI 字体")}
          defaultLabel={t("系统默认字体")}
          value={preferences.uiFontFamily}
          fonts={fonts}
          onChange={(uiFontFamily) => onChange({ uiFontFamily })}
        />
        <p className="setting-hint">{t("用于侧边栏、文章列表、工具栏与设置。")}</p>
        <p className="font-preview">{t("界面字体预览 · 墨牍 设置、侧边栏与工具栏")}</p>
      </div>
      <div className="setting-field">
        <FontSizeField
          label={t("界面字号")}
          range={fontSizes}
          value={preferences.uiFontSize ?? fontSizes.uiDefault}
          onChange={(uiFontSize) => onChange({ uiFontSize })}
        />
        <p className="setting-hint">
          {t("调整界面文字大小。")} {desktop && t("也可用 ⌘ + / − 快速调整。")}
        </p>
      </div>
    </div>
  );
}
