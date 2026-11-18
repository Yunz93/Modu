import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  BookOpenIcon,
  DatabaseIcon,
  InfoIcon,
  KeyboardIcon,
  PaletteIcon,
  XIcon,
} from "@phosphor-icons/react";
import { AppearanceSettings } from "./AppearanceSettings";
import type { Preferences, Source } from "./model";

const sections = [
  { id: "appearance", label: "外观", icon: PaletteIcon },
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
  onRestoreSource: (id: string) => Promise<void>;
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
  onExportBackup,
  onRestoreBackup,
  onExportOpml,
  updatePanel,
}: Props) {
  const id = useId();
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
          <header className="settings-header">
            <Dialog.Title>设置</Dialog.Title>
            <Dialog.Close
              className="icon-button"
              aria-label="关闭设置"
              disabled={locked}
            >
              <XIcon size={21} />
            </Dialog.Close>
          </header>
          <div className="settings-layout">
            <nav className="settings-nav" aria-label="设置分类">
              {sections.map(({ id: value, label, icon: Icon }) => (
                <button
                  key={value}
                  className="quiet-button"
                  type="button"
                  aria-current={section === value ? "page" : undefined}
                  disabled={locked}
                  onClick={() => onSectionChange(value)}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </nav>
            <div
              className="settings-pane"
              ref={pane}
              tabIndex={0}
              role="region"
              aria-labelledby={id}
            >
              <h2 id={id}>{active?.label}</h2>
              <div hidden={section !== "appearance"}>
                <AppearanceSettings
                  preferences={preferences}
                  effectiveTheme={effectiveTheme}
                  onChange={onPreferences}
                />
                <label className="settings-row">
                  <span>
                    界面字号<small>影响导航、文章列表与设置。</small>
                  </span>
                  <select
                    value={preferences.uiFontSize ?? 16}
                    onChange={(event) =>
                      onPreferences({
                        uiFontSize: Number(event.target.value),
                      })
                    }
                  >
                    <option value="14">小</option>
                    <option value="16">默认</option>
                    <option value="18">大</option>
                    <option value="20">特大</option>
                  </select>
                </label>
              </div>
              {section === "reading" && (
                <>
                  <label className="settings-row">
                    <span>
                      正文行宽<small>窄版在宽窗口中缩短每行文字。</small>
                    </span>
                    <select
                      value={preferences.narrowReading ? "narrow" : "standard"}
                      onChange={(event) =>
                        onPreferences({
                          narrowReading: event.target.value === "narrow",
                        })
                      }
                    >
                      <option value="standard">标准</option>
                      <option value="narrow">窄版</option>
                    </select>
                  </label>
                  <label className="settings-row">
                    <span>
                      打开文章时标为已读
                      <small>关闭后可在正文底部手动标为已读。</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={preferences.markReadOnOpen !== false}
                      onChange={(event) =>
                        onPreferences({ markReadOnOpen: event.target.checked })
                      }
                    />
                  </label>
                </>
              )}
              {section === "library" && (
                <>
                  <div className="settings-storage">
                    <strong>{dataPath ? "本机阅读库" : "浏览器阅读库"}</strong>
                    <p>
                      {dataPath ||
                        "保存在当前浏览器，可通过完整备份迁移到桌面版。"}
                    </p>
                  </div>
                  {storageError && (
                    <p className="form-error" role="alert">
                      {storageError}
                    </p>
                  )}
                  <p hidden={!notice} className="settings-note" role="status">
                    {notice}
                  </p>
                  <div className="settings-row">
                    <span>
                      完整备份<small>含订阅、文章、阅读状态和偏好。</small>
                    </span>
                    <button
                      className="quiet-button"
                      onClick={() => void onExportBackup()}
                    >
                      导出 JSON
                    </button>
                  </div>
                  <div className="settings-row">
                    <span>
                      从备份恢复
                      <small>选择备份后，先查看内容摘要并确认。</small>
                    </span>
                    <button className="quiet-button" onClick={onRestoreBackup}>
                      选择备份
                    </button>
                  </div>
                  <div className="settings-row">
                    <span>
                      订阅清单<small>将订阅地址带到其他 RSS 阅读器。</small>
                    </span>
                    <button
                      className="quiet-button"
                      onClick={() => void onExportOpml()}
                    >
                      导出 OPML
                    </button>
                  </div>
                  {archivedSources.length > 0 && (
                    <section
                      className="settings-archived"
                      aria-label="已归档的订阅"
                    >
                      <h3>已归档的订阅</h3>
                      {archivedSources.map((source) => (
                        <div className="settings-row" key={source.id}>
                          <span>{source.name}</span>
                          <button
                            className="quiet-button"
                            onClick={() => void onRestoreSource(source.id)}
                          >
                            恢复订阅
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
                      单键快捷键
                      <small>在正文和列表中使用。输入文字时暂停。</small>
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
                      <dt>设置</dt>
                      <dd>
                        <kbd>⌘</kbd>
                        <kbd>,</kbd>
                      </dd>
                    </div>
                    <div>
                      <dt>搜索文章</dt>
                      <dd>
                        <kbd>⌘</kbd>
                        <kbd>K</kbd>
                      </dd>
                    </div>
                    <div>
                      <dt>下一篇 / 上一篇</dt>
                      <dd>
                        <kbd>J</kbd>
                        <kbd>K</kbd>
                      </dd>
                    </div>
                    <div>
                      <dt>收藏 / 取消收藏</dt>
                      <dd>
                        <kbd>S</kbd>
                      </dd>
                    </div>
                    <div>
                      <dt>专注模式</dt>
                      <dd>
                        <kbd>F</kbd>
                      </dd>
                    </div>
                    <div>
                      <dt>退出专注 / 关闭面板</dt>
                      <dd>
                        <kbd>Esc</kbd>
                      </dd>
                    </div>
                  </dl>
                </>
              )}
              {section === "updates" && updatePanel}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
