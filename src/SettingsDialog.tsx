import { useTranslation } from "./locale-context";
import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  BookOpenIcon,
  DatabaseIcon,
  InfoIcon,
  KeyboardIcon,
  PaletteIcon,
  CheckIcon,
} from "@phosphor-icons/react";
import { InterfaceSettings } from "./InterfaceSettings";
import { ReadingSettings, useFontChoices } from "./TypographySettings";
import type { Preferences, Source } from "./model";

const sections = [
  { id: "appearance", label: "界面", icon: PaletteIcon },
  { id: "reading", label: "阅读", icon: BookOpenIcon },
  { id: "library", label: "阅读库", icon: DatabaseIcon },
  { id: "shortcuts", label: "快捷键", icon: KeyboardIcon },
  { id: "updates", label: "关于与更新", icon: InfoIcon },
] as const;

export type SettingsSection = (typeof sections)[number]["id"];
type Props = {
  section: SettingsSection | null;
  onSectionChange: (section: SettingsSection | null) => void;
  restoreFocus: () => void;
  locked: boolean;
  preferences: Preferences;
  effectiveTheme: Preferences["theme"];
  onPreferences: (patch: Partial<Preferences>) => void;
  dataPath?: string;
  storageError: string;
  notice: string;
  archivedSources: Source[];
  onRestoreSource: (source: Source) => Promise<void>;
  sourceBusy: boolean;
  onExportBackup: () => Promise<void>;
  onRestoreBackup: () => void;
  onExportOpml: () => Promise<void>;
  updatePanel: ReactNode;
};

export function SettingsDialog({
  section,
  onSectionChange,
  restoreFocus,
  locked,
  preferences,
  effectiveTheme,
  onPreferences,
  dataPath,
  storageError,
  notice,
  archivedSources,
  onRestoreSource,
  sourceBusy,
  onExportBackup,
  onRestoreBackup,
  onExportOpml,
  updatePanel,
}: Props) {
  const { t } = useTranslation();
  const id = useId();
  const fonts = useFontChoices(section !== null);
  const pane = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => pane.current?.scrollTo(0, 0), [section]);
  const active = sections.find(({ id }) => id === section);
  return (
    <Dialog.Root
      open={section !== null}
      onOpenChange={(open) => {
        if (!open && !locked) onSectionChange(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="settings-dialog"
          aria-describedby={undefined}
          aria-busy={locked}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocus();
          }}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (locked) event.preventDefault();
          }}
        >
          <div className="settings-rail">
            <Dialog.Title className="settings-title">{t("设置")}</Dialog.Title>
            <nav className="settings-nav" aria-label={t("设置分类")}>
              {sections.map(({ id: value, label, icon: Icon }) => (
                <button
                  key={value}
                  className="quiet-button"
                  type="button"
                  aria-current={section === value ? "page" : undefined}
                  disabled={locked}
                  onClick={() => onSectionChange(value)}
                >
                  <Icon size={18} aria-hidden="true" />
                  {t(label)}
                </button>
              ))}
            </nav>
          </div>
          <div className="settings-main">
            <div
              className="settings-pane"
              ref={pane}
              tabIndex={0}
              role="region"
              aria-labelledby={id}
            >
              <h2 id={id}>{active && t(active.label)}</h2>
              <div hidden={section !== "appearance"} inert={locked}>
                <InterfaceSettings
                  preferences={preferences}
                  effectiveTheme={effectiveTheme}
                  fonts={fonts.names}
                  onChange={onPreferences}
                />
              </div>
              <div hidden={section !== "reading"} inert={locked}>
                <ReadingSettings
                  preferences={preferences}
                  fonts={fonts}
                  onChange={onPreferences}
                />
                <label className="settings-row">
                  <span>
                    {t("正文行宽")}<small>{t("窄版在宽窗口中缩短每行文字。")}</small>
                  </span>
                  <select
                    value={preferences.narrowReading ? "narrow" : "standard"}
                    onChange={(event) =>
                      onPreferences({
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
                      onPreferences({ markReadOnOpen: event.target.checked })
                    }
                  />
                </label>
              </div>
              {section === "library" && (
                <>
                  <div className="settings-storage">
                    <strong>{dataPath ? t("本机阅读库") : t("浏览器阅读库")}</strong>
                    <p>
                      {dataPath ||
                        t("保存在当前浏览器，可通过完整备份迁移到桌面版。")}
                    </p>
                  </div>
                  {storageError && (
                    <p className="form-error" role="alert">
                      {t(storageError)}
                    </p>
                  )}
                  <p hidden={!notice} className="settings-note" role="status">
                    {t(notice)}
                  </p>
                  <div className="settings-row">
                    <span>
                      {t("完整备份")}<small>{t("含订阅、文章、阅读状态和偏好。")}</small>
                    </span>
                    <button
                      className="quiet-button"
                      onClick={() => void onExportBackup()}
                    >
                      {t("导出 JSON")}
                    </button>
                  </div>
                  <div className="settings-row">
                    <span>
                      {t("从备份恢复")}
                      <small>{t("选择备份后，先查看内容摘要并确认。")}</small>
                    </span>
                    <button className="quiet-button" onClick={onRestoreBackup}>
                      {t("选择备份")}
                    </button>
                  </div>
                  <div className="settings-row">
                    <span>
                      {t("订阅清单")}<small>{t("将订阅地址带到其他 RSS 阅读器。")}</small>
                    </span>
                    <button
                      className="quiet-button"
                      onClick={() => void onExportOpml()}
                    >
                      {t("导出 OPML")}
                    </button>
                  </div>
                  {archivedSources.length > 0 && (
                    <section
                      className="settings-archived"
                      aria-label={t("已归档的订阅")}
                    >
                      <h3>{t("已归档的订阅")}</h3>
                      {archivedSources.map((source) => (
                        <div className="settings-row" key={source.id}>
                          <span>{source.name}</span>
                          <button
                            className="quiet-button"
                            aria-disabled={sourceBusy}
                            onClick={() => void onRestoreSource(source)}
                          >
                            {t("恢复订阅")}
                          </button>
                        </div>
                      ))}
                    </section>
                  )}
                </>
              )}
              {section === "shortcuts" && (
                <>
                  <label className="settings-row">
                    <span>
                      {t("单键快捷键")}
                      <small>{t("在正文和列表中使用。输入文字时暂停。")}</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={preferences.singleKeyShortcuts !== false}
                      onChange={(event) =>
                        onPreferences({
                          singleKeyShortcuts: event.target.checked,
                        })
                      }
                    />
                  </label>
                  <dl className="shortcut-list settings-shortcuts">
                    <div>
                      <dt>{t("设置")}</dt>
                      <dd>
                        <kbd>⌘</kbd>
                        <kbd>,</kbd>
                      </dd>
                    </div>
                    <div>
                      <dt>{t("搜索文章")}</dt>
                      <dd>
                        <kbd>⌘</kbd>
                        <kbd>K</kbd>
                      </dd>
                    </div>
                    <div>
                      <dt>{t("下一篇 / 上一篇")}</dt>
                      <dd>
                        <kbd>J</kbd>
                        <kbd>K</kbd>
                      </dd>
                    </div>
                    <div>
                      <dt>{t("收藏 / 取消收藏")}</dt>
                      <dd>
                        <kbd>S</kbd>
                      </dd>
                    </div>
                    <div>
                      <dt>{t("专注模式")}</dt>
                      <dd>
                        <kbd>F</kbd>
                      </dd>
                    </div>
                    <div>
                      <dt>{t("退出专注 / 关闭面板")}</dt>
                      <dd>
                        <kbd>Esc</kbd>
                      </dd>
                    </div>
                  </dl>
                </>
              )}
              {section === "updates" && updatePanel}
            </div>
            <footer className="settings-footer">
              <Dialog.Close className="primary-button" disabled={locked}>
                <CheckIcon size={18} aria-hidden="true" />
                {t("完成")}
              </Dialog.Close>
            </footer>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
