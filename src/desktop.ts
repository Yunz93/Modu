import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Article, Library, Locale, Source } from "./model";
import { closeAfterSaving } from "./close-flow";
import { createSaveQueue } from "./save-queue";
export const desktop = isTauri();
export type Loaded = { library: Library; revision: number; dataPath: string };
export type PreparedFeed = {
  source: Source;
  articles: Article[];
  etag: string | null;
  modified: string | null;
  generation: number;
};
export type Changes = { source: Source; articles: Article[]; newCount: number };
export const native = {
  retry: () => invoke<Loaded>("retry_library"),
  recover: (library: Library) => invoke<Loaded>("recover_library", { library }),
  fonts: () => invoke<string[]>("list_system_fonts"),
  setAppearance: (theme: string, followSystem: boolean) =>
    invoke("set_app_appearance", { theme, followSystem }),
  setLocale: (locale: Locale) => invoke("set_app_locale", { locale }),
  recordFailure: (id: string, message: string) =>
    invoke<Source>("record_feed_failure", { id, message }),
  setSourceArchived: (id: string, archived: boolean) =>
    invoke<void>("set_subscription_archived", { id, archived }),
  editSource: (id: string, name: string, folderPath: string[]) =>
    invoke<Source>("edit_source", { id, name, folderPath }),
  fullText: (id: string, expectedUrl: string, refresh: boolean) =>
    invoke<string>("load_article_full_text", { id, expectedUrl, refresh }),
  fullTextImage: (id: string, address: string) =>
    invoke<ArrayBuffer>("load_full_text_image", { id, address }),
  snapshot: (library: Library) => {
    const { read, saved, positions, preferences, selectedId } = library;
    return invoke<Library>("export_library_snapshot", {
      snapshot: { read, saved, positions, preferences, selectedId },
    });
  },
  finishExit: () => invoke<void>("finish_exit"),
  load: () => invoke<Loaded>("load_library"),
  prepare: async (url: string, name = "", signal?: AbortSignal) => {
    if (signal?.aborted) throw new DOMException("已取消", "AbortError");
    const requestId = crypto.randomUUID();
    const cancel = () => {
      void invoke("cancel_feed_request", { requestId }).catch(() => {});
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      return await invoke<PreparedFeed>("prepare_feed", {
        url,
        name,
        requestId,
      });
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  },
  commit: (feed: PreparedFeed) => invoke<Changes>("commit_feed", { feed }),
  import: (library: Library, replace: boolean) =>
    invoke<Loaded>("import_library", { library, replace }),
  importFeedFile: (library: Library) =>
    invoke<Pick<Library, "sources" | "articles">>("import_feed_file", { library }),
  readFile: (backup: boolean) =>
    invoke<{ name: string; contents: string } | null>("import_file", {
      backup,
    }),
  export: (name: string, contents: string, extension: string) =>
    invoke<boolean>("export_file", { name, contents, extension }),
};
export function persistence(revision: number, error: (value: string) => void) {
  const queue = createSaveQueue<Library>(
    async (library) => {
      const { read, saved, positions, preferences, selectedId } = library;
      revision = await invoke<number>("save_state", {
        snapshot: { read, saved, positions, preferences, selectedId },
        revision,
      });
      error("");
    },
    (reason) => error(`最近改动尚未保存：${String(reason)}`),
  );
  return {
    ...queue,
    getRevision() {
      return revision;
    },
    resetRevision(value: number) {
      revision = value;
    },
  };
}
export async function installExitHandler(
  flush: () => Promise<void>,
  onError: (value: string) => void,
) {
  const { listen } = await import("@tauri-apps/api/event");
  let exiting = false;
  const unlisten = await listen("shidu://request-exit", async () => {
    if (exiting) return;
    exiting = true;
    try {
      await closeAfterSaving({
        save: flush,
        exit: () => invoke("finish_exit"),
      });
    } catch (reason) {
      onError(`退出前保存失败：${String(reason)}。请重试或导出备份。`);
      exiting = false;
    }
  });
  await invoke("frontend_ready");
  return unlisten;
}
export function interceptExternalLinks(event: MouseEvent) {
  if (!desktop || !(event.target instanceof Element)) return;
  const anchor = event.target.closest("a[href]");
  const url = anchor?.getAttribute("href");
  if (!url || url.startsWith("#")) return;
  event.preventDefault();
  if (/^https?:\/\//i.test(url))
    void invoke("open_external", { url }).catch(() => {});
}

export async function listenNativeMenus(
  onUpdates: () => void,
  onSettings: () => void,
) {
  const { listen } = await import("@tauri-apps/api/event");
  const subscriptions = await Promise.allSettled([
    listen("modu://updates", onUpdates),
    listen("modu://settings", onSettings),
  ]);
  const cleanup = () =>
    subscriptions.forEach((item) => {
      if (item.status === "fulfilled") item.value();
    });
  const failure = subscriptions.find((item) => item.status === "rejected");
  if (failure?.status === "rejected") {
    cleanup();
    throw failure.reason;
  }
  return cleanup;
}
