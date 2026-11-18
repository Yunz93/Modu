import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  DownloadSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Channel, invoke } from "@tauri-apps/api/core";
import {
  advanceProgress,
  installPreparedUpdate,
  type DownloadEvent,
  type DownloadProgress,
} from "./updater-flow";
import type { Preferences } from "./model";

type Update = {
  id: string;
  version: string;
  currentVersion: string;
  notes: string;
  date: string | null;
};
type Phase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "saving"
  | "installing"
  | "latest"
  | "error";
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferences: Preferences;
  onPreferences: (preferences: Preferences) => void;
  onAvailable: (version: string) => void;
  save: () => Promise<number>;
  onLock: (locked: boolean) => void;
  libraryBusy: boolean;
};
const emptyProgress: DownloadProgress = {
  received: 0,
  total: null,
  verifying: false,
};
const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export function UpdateCenter(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const [version, setVersion] = useState("");
  const [update, setUpdate] = useState<Update | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(emptyProgress);
  const active = useRef(false);
  const generation = useRef(0);
  const autoCheck = props.preferences.autoCheckUpdates !== false;
  const checking = phase === "checking";
  const locked = phase === "saving" || phase === "installing";
  const downloading = phase === "downloading";
  const report = (reason: unknown) => {
    setPhase("error");
    setMessage(reason instanceof Error ? reason.message : String(reason));
  };
  const check = async (silent = false) => {
    if (active.current) return;
    active.current = true;
    const epoch = ++generation.current;
    if (!silent) {
      setPhase("checking");
      setMessage("正在检查更新…");
      setUpdate(null);
    }
    try {
      const next = await invoke<Update | null>("check_app_update");
      if (epoch !== generation.current) return;
      const current = latest.current;
      current.onPreferences({
        ...current.preferences,
        lastUpdateCheckAt: new Date().toISOString(),
      });
      if (silent && next?.version === current.preferences.skippedUpdateVersion)
        return;
      setUpdate(next);
      setPhase(next ? "available" : "latest");
      setMessage(
        next ? `墨牍 ${next.version} 有新版本可用。` : "当前已是最新版本。",
      );
      if (next && !silent) current.onAvailable(next.version);
      if (next && silent) current.onAvailable(next.version);
    } catch (reason) {
      if (epoch === generation.current && !silent) report(reason);
    } finally {
      active.current = false;
    }
  };
  useEffect(() => {
    void invoke<{ currentVersion: string }>("app_update_status").then(
      (status) => setVersion(status.currentVersion),
    );
  }, []);
  useEffect(() => {
    if (!autoCheck) return;
    const timer = setTimeout(() => void check(true), 1800);
    return () => clearTimeout(timer);
  }, [autoCheck]);
  useEffect(() => {
    return () => {
      generation.current++;
      void invoke("cancel_app_update").catch(() => {});
    };
  }, []);
  const download = async () => {
    if (!update || active.current) return;
    active.current = true;
    setPhase("downloading");
    setMessage("正在下载，仍可继续阅读。");
    setProgress(emptyProgress);
    const epoch = ++generation.current;
    const channel = new Channel<DownloadEvent>();
    channel.onmessage = (event) => {
      if (epoch === generation.current) {
        setProgress((current) => advanceProgress(current, event));
        if (event.event === "Verifying")
          setMessage("下载完成，正在验证更新包…");
      }
    };
    try {
      await invoke("download_app_update", { id: update.id, onEvent: channel });
      if (epoch !== generation.current) return;
      setPhase("ready");
      setMessage("更新包已通过签名验证。安装后会重新打开墨牍。");
    } catch (reason) {
      if (epoch === generation.current) report(reason);
    } finally {
      active.current = false;
    }
  };
  const cancel = async () => {
    generation.current++;
    try {
      await invoke("cancel_app_update");
      setUpdate(null);
      setPhase("idle");
      setProgress(emptyProgress);
      setMessage("已取消下载，当前版本可以继续使用。");
    } catch (reason) {
      report(reason);
    }
  };
  const install = async () => {
    if (!update || active.current || props.libraryBusy) return;
    active.current = true;
    try {
      await installPreparedUpdate({
        lock: props.onLock,
        save: async () => {
          setPhase("saving");
          setMessage("正在保存最新阅读进度…");
          return props.save();
        },
        install: async (revision) => {
          setPhase("installing");
          setMessage("正在安装并重启墨牍…");
          await invoke("install_app_update", { id: update.id, revision });
        },
      });
    } catch (reason) {
      report(reason);
    } finally {
      active.current = false;
    }
  };
  const lastChecked = props.preferences.lastUpdateCheckAt;
  const label =
    phase === "saving"
      ? "正在保存"
      : phase === "installing"
        ? "正在安装"
        : phase === "ready"
          ? "安装并重启"
          : "下载更新";
  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={(open) => {
        if (!locked) props.onOpenChange(open);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="update-dialog"
          data-update-dialog
          aria-busy={locked}
          onEscapeKeyDown={(event) => {
            if (locked) event.preventDefault();
          }}
        >
          <Dialog.Title>关于墨牍与更新</Dialog.Title>
          <Dialog.Description>
            让喜欢的文字，留在自己的阅读节奏里。
          </Dialog.Description>
          <Dialog.Close
            className="icon-button dialog-close"
            aria-label="关闭更新面板"
            disabled={locked}
          >
            <XIcon size={21} />
          </Dialog.Close>
          <div className="app-version">
            <strong>墨牍</strong>
            <span>版本 {version || "…"} · Apple Silicon</span>
          </div>
          <label className="update-auto">
            <input
              type="checkbox"
              checked={autoCheck}
              disabled={locked}
              onChange={(event) =>
                props.onPreferences({
                  ...props.preferences,
                  autoCheckUpdates: event.target.checked,
                })
              }
            />
            自动检查更新<span>仅提示，不自动安装</span>
          </label>
          <div
            className="update-status"
            role={phase === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            <p>
              {message || "可随时检查新版本。更新前会保存阅读进度并保留备份。"}
            </p>
            {lastChecked && (
              <small>
                最近成功检查：{new Date(lastChecked).toLocaleString("zh-CN")}
              </small>
            )}
          </div>
          {update && (
            <section className="release-notes">
              <h3>墨牍 {update.version}</h3>
              <p>{update.notes || "此版本包含体验改进和问题修复。"}</p>
            </section>
          )}
          {downloading && (
            <div className="update-progress">
              <progress
                aria-label="更新下载进度"
                max={progress.total ?? undefined}
                value={
                  progress.total
                    ? Math.min(progress.received, progress.total)
                    : undefined
                }
              />
              <p>
                {progress.verifying
                  ? "正在验证签名"
                  : progress.total
                    ? `${size(progress.received)} / ${size(progress.total)}`
                    : `已下载 ${size(progress.received)}`}
              </p>
            </div>
          )}
          <div className="update-actions">
            {downloading ? (
              <>
                <button className="quiet-button" onClick={() => void cancel()}>
                  取消下载
                </button>
                <Dialog.Close className="quiet-button">继续阅读</Dialog.Close>
              </>
            ) : (
              <button
                className="quiet-button"
                disabled={checking || locked}
                onClick={() => void check()}
              >
                <ArrowClockwiseIcon size={18} />
                {checking ? "正在检查…" : "检查更新"}
              </button>
            )}
            {update && !downloading && (
              <button
                className="primary-button"
                disabled={
                  locked || checking || (phase === "ready" && props.libraryBusy)
                }
                onClick={() =>
                  void (phase === "ready" ? install() : download())
                }
              >
                <DownloadSimpleIcon size={18} />
                {label}
              </button>
            )}
          </div>
          {update && phase === "available" && (
            <button
              className="skip-version quiet-button"
              onClick={() => {
                props.onPreferences({
                  ...props.preferences,
                  skippedUpdateVersion: update.version,
                });
                setUpdate(null);
                setPhase("idle");
                setMessage("已跳过此版本。手动检查仍会显示它。");
                props.onAvailable("");
              }}
            >
              跳过这个版本
            </button>
          )}
          {phase === "ready" && props.libraryBusy && (
            <p className="form-note">等待订阅操作完成后即可安装。</p>
          )}
          <a
            className="update-release-link quiet-button"
            href="https://github.com/Yunz93/Modu/releases"
            target="_blank"
            rel="noreferrer"
          >
            <ArrowSquareOutIcon size={16} />
            查看所有版本
          </a>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
