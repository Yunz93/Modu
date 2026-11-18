import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRightIcon,
  FileArrowUpIcon,
  PlusIcon,
  RssSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { desktop } from "./desktop";
import { extraSource } from "./data";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (
    url: string,
    name: string,
  ) => Promise<string | undefined> | string | undefined;
  onDemo: () => void;
  demoAdded: boolean;
  onNativeFile?: () => Promise<string | undefined>;
  onFile: (file: File) => Promise<string | undefined>;
};

export function SubscriptionDialog({
  open,
  onOpenChange,
  onAdd,
  onDemo,
  demoAdded,
  onFile,
  onNativeFile,
}: Props) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const composing = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (importing) return;
        onOpenChange(value);
        if (!value) setError("");
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="subscription-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            urlInput.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (composing.current) event.preventDefault();
          }}
        >
          <div className="dialog-symbol">
            <RssSimpleIcon size={25} />
          </div>
          <Dialog.Title>添加订阅</Dialog.Title>
          <Dialog.Description>
            把喜欢的文字，放在同一个地方。
          </Dialog.Description>
          <Dialog.Close
            className="icon-button dialog-close"
            aria-label="关闭添加订阅"
          >
            <XIcon size={21} />
          </Dialog.Close>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (composing.current || importing) return;
              setImporting(true);
              const error = await onAdd(url, name);
              setImporting(false);
              if (error) setError(error);
              else {
                setUrl("");
                setName("");
                onOpenChange(false);
              }
            }}
          >
            <label htmlFor="feed-url">订阅地址</label>
            <input
              id="feed-url"
              ref={urlInput}
              type="text"
              inputMode="url"
              autoComplete="url"
              required
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setError("");
              }}
              placeholder="https://example.com/feed.xml"
              aria-describedby="feed-note feed-error"
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={() => {
                composing.current = false;
              }}
            />
            <label htmlFor="feed-name">
              显示名称 <span>可选</span>
            </label>
            <input
              id="feed-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：我的独立博客"
              onCompositionStart={() => {
                composing.current = true;
              }}
              onCompositionEnd={() => {
                composing.current = false;
              }}
            />
            <p className="form-note" id="feed-note">
              {desktop
                ? "支持 RSS / Atom，或自动寻找网页提供的订阅。文章缓存在本机，离线也能阅读。"
                : "保存订阅地址或导入已有文章，桌面版可直接联网抓取。"}
            </p>
            <p
              className="form-error"
              id="feed-error"
              role={error ? "alert" : undefined}
            >
              {error}
            </p>
            <button
              className="primary-button add-submit"
              type="submit"
              disabled={importing}
            >
              <PlusIcon size={19} />
              {importing
                ? "正在读取订阅…"
                : desktop
                  ? "添加并获取文章"
                  : "保存订阅地址"}
            </button>
          </form>
          <div className="dialog-alternatives">
            <button
              className="quiet-button"
              disabled={importing}
              onClick={async () => {
                if (!onNativeFile) {
                  fileInput.current?.click();
                  return;
                }
                setImporting(true);
                setError("");
                try {
                  const error = await onNativeFile();
                  if (error) setError(error);
                  else if (error === undefined) onOpenChange(false);
                } catch (reason) {
                  setError(String(reason));
                } finally {
                  setImporting(false);
                }
              }}
            >
              <FileArrowUpIcon size={20} />
              {importing ? "正在导入" : "导入 RSS / Atom / OPML"}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".xml,.rss,.atom,.opml,application/xml,text/xml"
              hidden
              aria-label="选择订阅文件"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setImporting(true);
                setError("");
                try {
                  const error = await onFile(file);
                  if (error) setError(error);
                  else onOpenChange(false);
                } finally {
                  setImporting(false);
                  event.target.value = "";
                }
              }}
            />
          </div>
          {!desktop && (
            <div className="demo-suggestion">
              <div>
                <p>先试读一个新来源</p>
                <span>{extraSource.name} · 示例订阅</span>
              </div>
              <button
                className="icon-button"
                aria-label={
                  demoAdded ? "慢写周刊已添加" : "添加慢写周刊示例订阅"
                }
                disabled={demoAdded || importing}
                onClick={() => {
                  onDemo();
                  onOpenChange(false);
                }}
              >
                {demoAdded ? "已添加" : <ArrowRightIcon size={22} />}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
