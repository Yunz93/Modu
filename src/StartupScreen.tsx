import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { native, type Loaded } from "./desktop";
import { isLibrary, type Library } from "./model";
export function StartupScreen({
  error,
  onLoaded,
}: {
  error: string;
  onLoaded: (loaded: Loaded) => void;
}) {
  const [backup, setBackup] = useState<Library | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const reading = useRef(false);
  const committing = useRef(false);
  const choose = async () => {
    if (reading.current || committing.current) return;
    reading.current = true;
    setBusy(true);
    try {
      const file = await native.readFile(true);
      if (!file) return;
      const value: unknown = JSON.parse(file.contents);
      if (!isLibrary(value)) throw Error("备份格式无效，原阅读库保持不变。");
      setMessage("");
      setBackup(value);
    } catch (reason) {
      setMessage(String(reason));
    } finally {
      reading.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="startup-screen">
      <h1>墨牍</h1>
      <p role={error ? "alert" : "status"}>{error || "正在打开本地阅读库…"}</p>
      {error && (
        <>
          <p>原数据仍保留。可重试读取，或选择完整备份恢复。</p>
          <div className="confirm-actions">
            <button
              className="quiet-button"
              disabled={busy}
              onClick={async () => {
                if (reading.current || committing.current) return;
                reading.current = true;
                setBusy(true);
                try {
                  onLoaded(await native.retry());
                } catch (reason) {
                  setMessage(String(reason));
                } finally {
                  reading.current = false;
                  setBusy(false);
                }
              }}
            >
              重试读取
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void choose()}
            >
              从备份恢复
            </button>
          </div>
        </>
      )}
      {message && (
        <p className="recovery-error" role="alert">
          {message}
        </p>
      )}
      <Dialog.Root
        open={!!backup}
        onOpenChange={(open) => {
          if (!open && !committing.current) setBackup(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="shortcuts-dialog">
            <Dialog.Title>恢复无法读取的阅读库</Dialog.Title>
            <Dialog.Description>
              备份包含 {backup?.sources.length} 个订阅、
              {backup?.articles.length}{" "}
              篇文章。先保留原始数据库与日志，再使用此备份恢复。
            </Dialog.Description>
            {message && (
              <p className="form-error" role="alert">
                {message}
              </p>
            )}
            <div className="confirm-actions">
              <button
                className="quiet-button"
                disabled={busy}
                onClick={() => setBackup(null)}
              >
                取消
              </button>
              <button
                className="primary-button"
                disabled={busy}
                onClick={async () => {
                  if (!backup || committing.current) return;
                  committing.current = true;
                  setBusy(true);
                  try {
                    onLoaded(await native.recover(backup));
                  } catch (reason) {
                    setMessage(String(reason));
                  } finally {
                    committing.current = false;
                    setBusy(false);
                  }
                }}
              >
                {busy ? "正在保留原库并恢复…" : "保留原库并恢复"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
