import { translate } from "./locale";
import { useEffect, useRef, useState } from "react";
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  DownloadSimpleIcon,
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
  enabled: boolean;
  onContinue: () => void;
  preferences: Preferences;
  onPreferences: (preferences: Partial<Preferences>) => void;
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
export function useUpdateCenter(props: Props) {
  const locale = props.preferences.locale ?? "zh-CN";
  const t = translate[locale];
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
        lastUpdateCheckAt: new Date().toISOString(),
      });
      if (silent && next?.version === current.preferences.skippedUpdateVersion)
        return;
      setUpdate(next);
      setPhase(next ? "available" : "latest");
      setMessage(
        next ? "墨牍 {0} 有新版本可用。" : "当前已是最新版本。",
      );
      current.onAvailable(next?.version ?? "");
    } catch (reason) {
      if (epoch === generation.current && !silent) report(reason);
    } finally {
      active.current = false;
    }
  };
  useEffect(() => {
    if (!props.enabled) return;
    void invoke<{ currentVersion: string }>("app_update_status")
      .then((status) => setVersion(status.currentVersion))
      .catch(report);
  }, [props.enabled]);
  useEffect(() => {
    if (!props.enabled || !autoCheck) return;
    const timer = setTimeout(() => void check(true), 1800);
    return () => clearTimeout(timer);
  }, [props.enabled, autoCheck]);
  useEffect(() => {
    if (!props.enabled) return;
    return () => {
      generation.current++;
      void invoke("cancel_app_update").catch(() => {});
    };
  }, [props.enabled]);
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
      ? t("正在保存")
      : phase === "installing"
        ? t("正在安装")
        : phase === "ready"
          ? t("安装并重启")
          : t("下载更新");
  return (
    <div className="update-panel" data-update-dialog aria-busy={locked}>
      <div className="app-version">
        <strong>{t("墨牍")}</strong>
        <span>{t("版本 {0}", [version || "…"])} · Apple Silicon</span>
      </div>
      <label className="update-auto">
        <input
          type="checkbox"
          checked={autoCheck}
          disabled={locked}
          onChange={(event) =>
            props.onPreferences({
              autoCheckUpdates: event.target.checked,
            })
          }
        />
        {t("自动检查更新")}<span>{t("仅提示，不自动安装")}</span>
      </label>
      <div
        className="update-status"
        role={phase === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        <p>{t(message || "可随时检查新版本。更新前会保存阅读进度并保留备份。", [update?.version])}</p>
        {lastChecked && (
          <small>
            {t("最近成功检查：{0}", [new Date(lastChecked).toLocaleString(locale)])}
          </small>
        )}
      </div>
      {update && (
        <section className="release-notes">
          <h3>{t("墨牍")} {update.version}</h3>
          <p>{update.notes || t("此版本包含体验改进和问题修复。")}</p>
        </section>
      )}
      {downloading && (
        <div className="update-progress">
          <progress
            aria-label={t("更新下载进度")}
            max={progress.total ?? undefined}
            value={
              progress.total
                ? Math.min(progress.received, progress.total)
                : undefined
            }
          />
          <p>
            {progress.verifying
              ? t("正在验证签名")
              : progress.total
                ? `${size(progress.received)} / ${size(progress.total)}`
                : t("已下载 {0}", [size(progress.received)])}
          </p>
        </div>
      )}
      <div className="update-actions">
        {downloading ? (
          <>
            <button className="quiet-button" onClick={() => void cancel()}>
              {t("取消下载")}
            </button>
            <button className="quiet-button" onClick={props.onContinue}>
              {t("继续阅读")}
            </button>
          </>
        ) : (
          <button
            className="quiet-button"
            disabled={checking || locked}
            onClick={() => void check()}
          >
            <ArrowClockwiseIcon size={18} />
            {checking ? t("正在检查…") : t("检查更新")}
          </button>
        )}
        {update && !downloading && (
          <button
            className="primary-button"
            disabled={
              locked || checking || (phase === "ready" && props.libraryBusy)
            }
            onClick={() => void (phase === "ready" ? install() : download())}
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
              skippedUpdateVersion: update.version,
            });
            setUpdate(null);
            setPhase("idle");
            setMessage("已跳过此版本。手动检查仍会显示它。");
            props.onAvailable("");
          }}
        >
          {t("跳过这个版本")}
        </button>
      )}
      {props.preferences.skippedUpdateVersion && !locked && (
        <button
          className="quiet-button skip-version"
          onClick={() => {
            props.onPreferences({ skippedUpdateVersion: "" });
            setMessage("已恢复提示，点「检查更新」查看可用版本。");
          }}
        >
          {t("恢复已跳过的版本提示")}
        </button>
      )}
      {phase === "ready" && props.libraryBusy && (
        <p className="form-note">{t("等待订阅操作完成后即可安装。")}</p>
      )}
      <a
        className="update-release-link quiet-button"
        href="https://github.com/Yunz93/Modu/releases"
        target="_blank"
        rel="noreferrer"
      >
        <ArrowSquareOutIcon size={16} />
        {t("查看所有版本")}
      </a>
    </div>
  );
}
