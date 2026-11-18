import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { closeAfterSaving, closeAfterExport } from "./close-flow";
import { native } from "./desktop";
type Props = {
  error: string;
  onError: (error: string) => void;
  save: () => Promise<void>;
  exportBackup: () => Promise<boolean>;
};
export function CloseRecoveryDialog({
  error,
  onError,
  save,
  exportBackup,
}: Props) {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const run = async (action: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await action();
    } catch (reason) {
      onError(String(reason));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Dialog.Root
      open={!!error}
      onOpenChange={(open) => {
        if (!open && !pending.current) onError("");
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="shortcuts-dialog">
          <Dialog.Title>退出前尚未保存成功</Dialog.Title>
          <Dialog.Description>
            {error}可以继续阅读、重试保存，或导出完整备份后退出。
          </Dialog.Description>
          <div className="confirm-actions">
            <button
              className="quiet-button"
              disabled={busy}
              onClick={() => onError("")}
            >
              继续使用
            </button>
            <button
              className="quiet-button"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  closeAfterExport({
                    export: exportBackup,
                    exit: native.finishExit,
                  }),
                )
              }
            >
              导出备份并退出
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  closeAfterSaving({ save, exit: native.finishExit }),
                )
              }
            >
              重试保存并退出
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
