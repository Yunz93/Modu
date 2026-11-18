import { useId, useState } from "react";
import { CheckIcon, MinusIcon, PlusIcon } from "@phosphor-icons/react";
import {
  accentPresets,
  contrastRatio,
  isFontName,
  resolveAccent,
  themePalettes,
} from "./appearance";
import type { Preferences } from "./model";

type Props = {
  preferences: Preferences;
  onChange: (preferences: Preferences) => void;
};

export function AppearanceSettings({ preferences, onChange }: Props) {
  const id = useId();
  const [uiFont, setUiFont] = useState(preferences.uiFontFamily ?? "");
  const [readingFont, setReadingFont] = useState(
    preferences.readingFontFamily ?? "",
  );
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const accent = preferences.accentColor ?? "";
  const fontChoices = [
    "PingFang SC",
    "Songti SC",
    "Kaiti SC",
    "Heiti SC",
    "Avenir Next",
    "Helvetica Neue",
    "Arial",
    "Georgia",
    "Times New Roman",
  ];
  const presetFont = (font: "serif" | "sans") => {
    setReadingFont("");
    setFeedback("");
    onChange({ ...preferences, font, readingFontFamily: "" });
  };
  return (
    <div className="appearance-settings">
      <h3>阅读外观</h3>
      <div className="appearance-row">
        <span>外观</span>
        <div className="segmented">
          <button
            aria-pressed={preferences.theme === "paper"}
            onClick={() => onChange({ ...preferences, theme: "paper" })}
          >
            纸质白
          </button>
          <button
            aria-pressed={preferences.theme === "night"}
            onClick={() => onChange({ ...preferences, theme: "night" })}
          >
            金属灰
          </button>
        </div>
      </div>
      <section className="appearance-section" aria-label="主题色设置">
        <div className="appearance-section-heading">
          <h4>主题色</h4>
          <button
            className="appearance-reset"
            onClick={() => onChange({ ...preferences, accentColor: "" })}
          >
            恢复墨知配色
          </button>
        </div>
        <div className="accent-options">
          {[{ name: "墨知默认", color: "" }, ...accentPresets].map((preset) => (
            <button
              key={preset.name}
              className="accent-swatch"
              aria-label={`${preset.name}主题色`}
              aria-pressed={accent === preset.color}
              title={preset.name}
              style={{
                backgroundColor:
                  preset.color || themePalettes[preferences.theme].accent,
                color:
                  contrastRatio(
                    preset.color || themePalettes[preferences.theme].accent,
                    "#fffaf4",
                  ) >= 4.5
                    ? "#fffaf4"
                    : "#231e19",
              }}
              onClick={() =>
                onChange({ ...preferences, accentColor: preset.color })
              }
            >
              {accent === preset.color && <CheckIcon size={17} weight="bold" />}
            </button>
          ))}
          <label className="custom-color-control" title="自定义主题色">
            <span>自选</span>
            <input
              type="color"
              aria-label="自定义主题色"
              value={accent || themePalettes[preferences.theme].accent}
              onInput={(event) =>
                onChange({
                  ...preferences,
                  accentColor: event.currentTarget.value,
                })
              }
              onChange={(event) =>
                onChange({ ...preferences, accentColor: event.target.value })
              }
            />
          </label>
        </div>
        <p className="appearance-hint">
          强调色用于按钮、链接与选中状态，会随明暗外观调整对比度。
        </p>
      </section>
      <section className="appearance-section" aria-label="字体设置">
        <div className="appearance-section-heading">
          <h4>字体</h4>
          <button
            className="appearance-reset"
            onClick={() => {
              setUiFont("");
              setReadingFont("");
              setFeedback("已恢复默认字体");
              setError("");
              onChange({
                ...preferences,
                font: "serif",
                uiFontFamily: "",
                readingFontFamily: "",
              });
            }}
          >
            恢复默认
          </button>
        </div>
        <div className="appearance-row">
          <span>正文预设</span>
          <div className="segmented">
            <button
              aria-pressed={
                !preferences.readingFontFamily && preferences.font === "serif"
              }
              onClick={() => presetFont("serif")}
            >
              宋体
            </button>
            <button
              aria-pressed={
                !preferences.readingFontFamily && preferences.font === "sans"
              }
              onClick={() => presetFont("sans")}
            >
              黑体
            </button>
          </div>
        </div>
        <div className="appearance-row">
          <span>正文字号</span>
          <div className="stepper">
            <button
              className="icon-button"
              aria-label="缩小字号"
              disabled={preferences.fontSize <= 16}
              onClick={() =>
                onChange({ ...preferences, fontSize: preferences.fontSize - 1 })
              }
            >
              <MinusIcon size={17} />
            </button>
            <output>{preferences.fontSize}</output>
            <button
              className="icon-button"
              aria-label="放大字号"
              disabled={preferences.fontSize >= 28}
              onClick={() =>
                onChange({ ...preferences, fontSize: preferences.fontSize + 1 })
              }
            >
              <PlusIcon size={17} />
            </button>
          </div>
        </div>
        <form
          className="custom-font-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!isFontName(uiFont) || !isFontName(readingFont)) {
              setError("字体名称须在 100 个字符内，且不能包含换行。");
              return;
            }
            onChange({
              ...preferences,
              uiFontFamily: uiFont.trim(),
              readingFontFamily: readingFont.trim(),
            });
            setError("");
            setFeedback("字体已应用");
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.nativeEvent.isComposing || event.keyCode === 229)
            )
              event.preventDefault();
          }}
        >
          <label htmlFor={`${id}-ui`}>界面字体</label>
          <input
            id={`${id}-ui`}
            list={`${id}-fonts`}
            value={uiFont}
            placeholder="系统默认，如 PingFang SC"
            onChange={(event) => {
              setUiFont(event.target.value);
              setFeedback("");
            }}
            aria-describedby={`${id}-font-hint`}
            maxLength={100}
            autoComplete="off"
          />
          <label htmlFor={`${id}-reading`}>正文字体</label>
          <input
            id={`${id}-reading`}
            list={`${id}-fonts`}
            value={readingFont}
            placeholder="默认宋体，如 Kaiti SC"
            onChange={(event) => {
              setReadingFont(event.target.value);
              setFeedback("");
            }}
            aria-describedby={`${id}-font-hint`}
            maxLength={100}
            autoComplete="off"
          />
          <datalist id={`${id}-fonts`}>
            {fontChoices.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <p id={`${id}-font-hint`} className="appearance-hint">
            填写本机已安装的字体名称。未安装时使用默认字体；代码保持等宽。
          </p>
          <div className="font-apply-row">
            <span role="status">{feedback}</span>
            <button type="submit" className="primary-button">
              应用字体
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>
      <p
        className="appearance-preview"
        style={{ color: resolveAccent(accent, preferences.theme) }}
      >
        Aa 好内容，慢慢读。
      </p>
    </div>
  );
}
