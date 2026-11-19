import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useTranslation } from "./locale-context";
import { availableFolders, folderPath } from "./source-layout";
import type { Source } from "./model";

export function SourceEditDialog({ source, sources, onSave, onClose }: {
  source: Source;
  sources: Source[];
  onSave: (name: string, path: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const folders = availableFolders(sources);
  const [name, setName] = useState(source.name);
  const [folder, setFolder] = useState(JSON.stringify(folderPath(source)));
  const [newFolder, setNewFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="subscription-dialog">
          <Dialog.Title>{t("编辑订阅")}</Dialog.Title>
          <Dialog.Description>{source.url}</Dialog.Description>
          <form onSubmit={async (event) => {
            event.preventDefault();
            if (busy || !name.trim()) return;
            const path = folder === "new"
              ? newFolder.split("/").map((part) => part.trim()).filter(Boolean)
              : folders.get(folder) ?? [];
            if ((folder === "new" && !path.length) || path.length > 32 ||
                path.some((part) => part.length > 120)) {
              setError(t("请输入有效的分组名称。"));
              return;
            }
            setBusy(true);
            setError("");
            try {
              await onSave(name.trim(), path);
              onClose();
            } catch (reason) {
              setError(t(String(reason)));
              setBusy(false);
            }
          }}>
            <label>
              {t("显示名称")}
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} required />
            </label>
            <label>
              {t("订阅分组")}
              <select className="setting-select" value={folder} onChange={(event) => setFolder(event.target.value)}>
                <option value="[]">{t("未分组")}</option>
                {[...folders].map(([key, path]) => (
                  <option key={key} value={key}>{path.join(" / ")}</option>
                ))}
                <option value="new">{t("新建分组…")}</option>
              </select>
            </label>
            {folder === "new" && (
              <label>
                {t("新分组名称")}
                <input
                  value={newFolder}
                  onChange={(event) => setNewFolder(event.target.value)}
                  placeholder={t("例如 技术 / Rust")}
                  required
                />
              </label>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="confirm-actions">
              <Dialog.Close className="quiet-button" type="button" disabled={busy}>{t("取消")}</Dialog.Close>
              <button className="primary-button" type="submit" disabled={busy || !name.trim()}>{t("保存")}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
