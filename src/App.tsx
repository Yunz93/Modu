import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import {
  ArchiveIcon,
  ArrowClockwiseIcon,
  BookmarkSimpleIcon,
  CircleIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  FileArrowUpIcon,
  KeyboardIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  RssSimpleIcon,
  SidebarSimpleIcon,
  StackIcon,
  XIcon,
} from "@phosphor-icons/react";
import { createLibrary, extraArticle, extraSource } from "./data";
import { downloadFile, exportOpml, parseFeedFile } from "./feed-import";
import {
  filterArticles,
  httpUrl,
  isLibrary,
  mergeImport,
  storageKey,
  type Library,
  type View,
} from "./model";
import { UpdateCenter } from "./UpdateCenter";
import { Reader } from "./Reader";
import { SubscriptionDialog } from "./SubscriptionDialog";
import {
  desktop,
  native,
  persistence,
  installExitHandler,
  interceptExternalLinks,
  type Loaded,
  type Changes,
} from "./desktop";
import { applyAppearance, normalizePreferences } from "./appearance";

function loadLibrary(): { library: Library; error: string } {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { library: createLibrary(), error: "" };
    const value: unknown = JSON.parse(raw);
    if (isLibrary(value))
      return {
        library: {
          ...value,
          preferences: normalizePreferences(value.preferences),
        },
        error: "",
      };
    return {
      library: createLibrary(),
      error: "原有阅读库格式异常，已保留原数据。本次操作暂不保存。",
    };
  } catch {
    return {
      library: createLibrary(),
      error: "无法读取本地阅读库。本次操作暂不保存。",
    };
  }
}

const viewLabels: Record<View, string> = {
  unread: "未读",
  all: "全部文章",
  saved: "收藏",
};
const navigation = [
  ["unread", ListBulletsIcon],
  ["all", StackIcon],
  ["saved", BookmarkSimpleIcon],
] as const;

export function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (desktop)
      void native
        .load()
        .then(setLoaded)
        .catch((reason) => setError(String(reason)));
    document.addEventListener("click", interceptExternalLinks, true);
    return () =>
      document.removeEventListener("click", interceptExternalLinks, true);
  }, []);
  if (desktop && !loaded)
    return (
      <div className="startup-screen">
        <h1>墨牍</h1>
        <p role={error ? "alert" : "status"}>
          {error || "正在打开本地阅读库…"}
        </p>
        {error && (
          <button
            className="primary-button"
            onClick={() => window.location.reload()}
          >
            重试
          </button>
        )}
      </div>
    );
  return <ReaderApp loaded={loaded} />;
}

function ReaderApp({ loaded }: { loaded: Loaded | null }) {
  const [initial] = useState(() =>
    loaded
      ? {
          library: {
            ...loaded.library,
            preferences: normalizePreferences(loaded.library.preferences),
          },
          error: "",
        }
      : loadLibrary(),
  );
  const [library, setLibrary] = useState(initial.library);
  const [storageError, setStorageError] = useState(initial.error);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [newVersion, setNewVersion] = useState("");
  const [installLocked, setInstallLocked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updates, setUpdates] = useState<Changes[]>([]);
  const operation = useRef(0);
  const [nativeSave] = useState(() =>
    loaded ? persistence(loaded.revision, setStorageError) : null,
  );
  const [view, setView] = useState<View>("unread");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [focus, setFocus] = useState(false);
  const [mobileReader, setMobileReader] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [restore, setRestore] = useState<Library | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const libraryRef = useRef(library);
  const positions = useRef(library.positions);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  libraryRef.current = library;

  const persist = useCallback(
    (snapshot: Library) => {
      if (initial.error) return;
      if (nativeSave) {
        nativeSave.enqueue({
          ...snapshot,
          positions: { ...positions.current },
        });
        return;
      }
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ ...snapshot, positions: positions.current }),
        );
        setStorageError("");
      } catch {
        setStorageError("本地空间不足或不可用，最近改动尚未保存。请导出备份。");
      }
    },
    [initial.error, nativeSave],
  );
  useEffect(() => {
    persist(library);
  }, [library, persist]);
  useEffect(() => {
    const save = () => persist(libraryRef.current);
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      clearTimeout(saveTimer.current);
      clearTimeout(noticeTimer.current);
    };
  }, [persist]);
  useEffect(() => {
    if (!nativeSave) return;
    let cleanup: (() => void) | undefined;
    let disposed = false;
    void installExitHandler(async () => {
      clearTimeout(saveTimer.current);
      nativeSave.enqueue({
        ...libraryRef.current,
        positions: { ...positions.current },
      });
      await nativeSave.flush();
    }, setStorageError).then((fn) => {
      if (disposed) fn();
      else cleanup = fn;
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [nativeSave]);
  useLayoutEffect(() => {
    applyAppearance(library.preferences);
  }, [library.preferences]);
  useEffect(() => {
    if (searchOpen) search.current?.focus();
  }, [searchOpen]);

  const notify = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3600);
  }, []);
  const article = library.articles.find(
    (article) => article.id === library.selectedId,
  );
  const source = library.sources.find(
    (source) => source.id === article?.sourceId,
  );
  const activeSource = library.sources.find((source) => source.id === sourceId);
  const articles = filterArticles(
    library,
    view,
    sourceId,
    query,
    library.selectedId,
  );
  const unreadCount = library.articles.filter(
    (article) =>
      !library.read.includes(article.id) &&
      !library.sources.find((s) => s.id === article.sourceId)?.archived,
  ).length;
  const heading = activeSource?.name ?? viewLabels[view];

  const openArticle = useCallback((id: string) => {
    setLibrary((current) => ({
      ...current,
      selectedId: id,
      read: [...new Set([...current.read, id])],
    }));
    setMobileReader(true);
  }, []);
  const navigate = (nextView: View, nextSource: string | null = null) => {
    const first = filterArticles(library, nextView, nextSource, "", null)[0];
    setView(nextView);
    setSourceId(nextSource);
    setQuery("");
    setSearchOpen(false);
    setNavOpen(false);
    setMobileReader(false);
    setLibrary((current) => ({ ...current, selectedId: first?.id ?? null }));
  };
  const toggleSave = useCallback(() => {
    const id = library.selectedId;
    if (!id) return;
    const saved = library.saved.includes(id);
    setLibrary((current) => ({
      ...current,
      saved: saved
        ? current.saved.filter((item) => item !== id)
        : [...current.saved, id],
    }));
    notify(saved ? "已取消收藏" : "已收藏，可在「收藏」中找到");
  }, [library.selectedId, library.saved, notify]);
  const toggleRead = () => {
    if (!article) return;
    const read = library.read.includes(article.id);
    setLibrary((current) => ({
      ...current,
      read: read
        ? current.read.filter((id) => id !== article.id)
        : [...current.read, article.id],
    }));
    notify(read ? "已标为未读" : "已标为已读");
  };

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      const editing = (event.target as HTMLElement)?.closest(
        'input, textarea, select, [contenteditable="true"]',
      );
      if (
        editing ||
        document.querySelector(
          '[role="dialog"], [data-radix-popper-content-wrapper]',
        )
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (["j", "k"].includes(event.key)) {
        event.preventDefault();
        const index = articles.findIndex(
          (item) => item.id === library.selectedId,
        );
        const next = articles[index + (event.key === "j" ? 1 : -1)];
        if (next) openArticle(next.id);
      } else if (event.key === "s") {
        event.preventDefault();
        toggleSave();
      } else if (event.key === "f") {
        event.preventDefault();
        setFocus((value) => !value);
      } else if (event.key === "Escape") {
        setFocus(false);
        setNavOpen(false);
      } else if (event.key === "?") setShortcutsOpen(true);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [articles, library.selectedId, openArticle, toggleSave]);

  const mergeChanges = (changes: Changes[]) => {
    setLibrary((current) => {
      let next = current;
      for (const change of changes)
        next = {
          ...mergeImport(next, [change.source], change.articles),
          sources: next.sources.some((s) => s.id === change.source.id)
            ? next.sources.map((s) =>
                s.id === change.source.id ? change.source : s,
              )
            : [...next.sources, change.source],
        };
      return {
        ...next,
        articles: [...next.articles].sort((a, b) =>
          b.date.localeCompare(a.date),
        ),
      };
    });
    setUpdates([]);
  };
  const refresh = async () => {
    if (!desktop) {
      notify("浏览器原型支持文件导入；桌面版可直接联网订阅。");
      return;
    }
    if (refreshing) return;
    setRefreshing(true);
    const epoch = operation.current;
    const changes: Changes[] = [];
    const failures: string[] = [];
    for (const source of libraryRef.current.sources.filter(
      (s) => s.kind !== "demo" && !s.archived,
    )) {
      try {
        const prepared = await native.prepare(source.url, source.name);
        if (epoch !== operation.current) break;
        changes.push(await native.commit(prepared));
      } catch (reason) {
        failures.push(`${source.name}：${String(reason)}`);
      }
    }
    if (epoch === operation.current) {
      const count = changes.reduce((n, c) => n + c.newCount, 0);
      if (changes.length) setUpdates(changes);
      notify(
        failures.length
          ? failures.join("；")
          : count
            ? `已获取 ${count} 篇新文章`
            : "订阅已是最新",
      );
    }
    setRefreshing(false);
  };
  const exportLibrary = async (
    name: string,
    contents: string,
    extension: string,
  ) => {
    try {
      if (desktop) {
        if (await native.export(name, contents, extension))
          notify("已导出，可在所选位置找到文件");
      } else {
        downloadFile(
          name,
          contents,
          extension === "json" ? "application/json" : "text/x-opml",
        );
        notify("已导出");
      }
    } catch (reason) {
      notify(String(reason));
    }
  };
  const chooseRestore = async () => {
    if (!desktop) {
      restoreInput.current?.click();
      return;
    }
    try {
      const file = await native.readFile(true);
      if (!file) return;
      const data: unknown = JSON.parse(file.contents);
      if (!isLibrary(data))
        throw new Error("备份格式无效，当前阅读库保持不变。");
      setRestore(data);
    } catch (reason) {
      notify(String(reason));
    }
  };
  const importFile = async (file: File): Promise<string | undefined> => {
    if (file.size > 5 * 1024 * 1024) return "请选择小于 5 MB 的订阅文件。";
    try {
      const imported = parseFeedFile(await file.text());
      if (desktop) {
        await nativeSave?.flush();
        const importedLibrary = mergeImport(
          libraryRef.current,
          imported.sources,
          imported.articles,
        );
        const result = await native.import(importedLibrary, false);
        setLibrary(result.library);
      } else
        setLibrary((current) => ({
          ...mergeImport(current, imported.sources, imported.articles),
          selectedId: imported.articles[0]?.id ?? null,
        }));
      setView("all");
      setSourceId(
        libraryRef.current.sources.find(
          (source) => source.url === imported.sources[0]?.url,
        )?.id ??
          imported.sources[0]?.id ??
          null,
      );
      setQuery("");
      notify(
        imported.articles.length
          ? `已导入 ${imported.articles.length} 篇文章，重复内容已合并`
          : desktop
            ? "订阅地址已导入，点击刷新获取文章"
            : "订阅地址已导入，桌面版可联网更新",
      );
    } catch (error) {
      return error instanceof Error
        ? error.message
        : "导入失败，请检查文件后重试。";
    }
  };

  useEffect(() => {
    if (!installLocked) return;
    const block = (event: Event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-update-dialog]")
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const events = ["click", "pointerdown", "keydown", "beforeinput", "wheel"];
    events.forEach((name) =>
      document.addEventListener(name, block, { capture: true, passive: false }),
    );
    return () =>
      events.forEach((name) => document.removeEventListener(name, block, true));
  }, [installLocked]);
  const sidebar = (
    <aside className="sidebar" aria-label="阅读库导航">
      <header className="brand-header">
        <div
          className={`window-controls ${desktop ? "native-controls" : ""}`}
          aria-hidden="true"
        >
          <CircleIcon weight="fill" className="window-close" />
          <CircleIcon weight="fill" className="window-minimize" />
          <CircleIcon weight="fill" className="window-expand" />
        </div>
        <span className="wordmark">墨牍</span>
        <button
          className="icon-button close-nav"
          aria-label="关闭导航"
          onClick={() => setNavOpen(false)}
        >
          <XIcon size={20} />
        </button>
      </header>
      <nav className="primary-nav" aria-label="文章分类">
        {navigation.map(([key, Icon]) => (
          <button
            key={key}
            className={`nav-item ${view === key && !sourceId ? "active" : ""}`}
            aria-current={view === key && !sourceId ? "page" : undefined}
            onClick={() => navigate(key)}
          >
            <Icon size={23} />
            <span>{viewLabels[key]}</span>
            {key === "unread" && unreadCount > 0 && (
              <span className="nav-count">{unreadCount}</span>
            )}
          </button>
        ))}
      </nav>
      <section className="sources-section">
        <h2>订阅</h2>
        <nav aria-label="订阅来源">
          {library.sources
            .filter((s) => !s.archived)
            .map((item) => (
              <button
                key={item.id}
                className={`nav-item source-item ${sourceId === item.id ? "source-active" : ""}`}
                aria-current={sourceId === item.id ? "page" : undefined}
                onClick={() => navigate("all", item.id)}
              >
                <RssSimpleIcon size={23} />
                <span>{item.name}</span>
                {item.kind === "pending" && (
                  <span
                    className="pending-source"
                    title="订阅地址已保存，点击刷新获取文章"
                  >
                    待更新
                  </span>
                )}
              </button>
            ))}
        </nav>
      </section>
      <div className="sidebar-bottom">
        <button
          className="primary-button add-source"
          onClick={() => setAddOpen(true)}
        >
          <PlusIcon size={23} />
          添加订阅
        </button>
        {desktop && newVersion && (
          <button
            className="update-available quiet-button"
            onClick={() => setUpdateOpen(true)}
          >
            墨牍 {newVersion} 可用
          </button>
        )}
        <div className="library-status">
          <button
            className="quiet-button refresh-button"
            aria-label="检查订阅更新"
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            <ArrowClockwiseIcon size={21} />
            <span>
              {storageError
                ? "保存出现问题"
                : refreshing
                  ? "正在刷新…"
                  : "刷新订阅"}
            </span>
          </button>
          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                className="icon-button more-button"
                aria-label="阅读库选项"
              >
                <DotsThreeIcon size={22} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="library-menu"
                side="top"
                align="start"
                sideOffset={10}
                collisionPadding={12}
              >
                <p className="menu-caption">你的阅读库</p>
                {desktop && (
                  <button onClick={() => setUpdateOpen(true)}>
                    <ArrowClockwiseIcon size={18} />
                    关于墨牍与更新
                    {newVersion && <span className="update-badge">新版</span>}
                  </button>
                )}
                <button
                  onClick={() => {
                    void exportLibrary(
                      "墨牍-阅读库备份.json",
                      JSON.stringify(
                        { ...library, positions: positions.current },
                        null,
                        2,
                      ),
                      "json",
                    );
                  }}
                >
                  <DownloadSimpleIcon size={18} />
                  导出完整备份
                </button>
                <button onClick={() => void chooseRestore()}>
                  <FileArrowUpIcon size={18} />
                  从备份恢复
                </button>
                <button
                  onClick={() => {
                    if (
                      !library.sources.some((source) => source.kind !== "demo")
                    ) {
                      notify("示例来源不导出。添加自己的订阅后即可导出 OPML。");
                      return;
                    }
                    void exportLibrary(
                      "墨牍-订阅.opml",
                      exportOpml(library.sources.filter((s) => !s.archived)),
                      "opml",
                    );
                  }}
                >
                  <RssSimpleIcon size={18} />
                  导出订阅 OPML
                </button>
                <button onClick={() => setShortcutsOpen(true)}>
                  <KeyboardIcon size={18} />
                  键盘快捷键<kbd>?</kbd>
                </button>
                <p className="menu-note">
                  {desktop
                    ? `阅读库保存在本机 SQLite。${loaded?.dataPath ?? ""}`
                    : "阅读库保存在当前浏览器；可通过完整备份迁移至桌面版。"}
                </p>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
        {storageError && (
          <p className="storage-error" role="alert">
            {storageError}
          </p>
        )}
      </div>
    </aside>
  );

  return (
    <div
      className={`app-shell ${focus ? "is-focused" : ""} ${mobileReader ? "show-reader" : ""} ${navOpen ? "nav-is-open" : ""}`}
    >
      <a className="skip-link" href="#main-content">
        跳到正文
      </a>
      {sidebar}
      <Dialog.Root open={navOpen} onOpenChange={setNavOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="nav-backdrop" />
          <Dialog.Content
            className="sidebar-drawer"
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">阅读库导航</Dialog.Title>
            {sidebar}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <section className="article-list" aria-label="文章列表">
        <header className="list-header">
          <div className="list-title-row">
            <button
              className="icon-button open-nav"
              aria-label="打开导航"
              onClick={() => setNavOpen(true)}
            >
              <SidebarSimpleIcon size={24} />
            </button>
            <h1>{heading}</h1>
            <button
              className={`icon-button search-toggle ${searchOpen ? "search-active" : ""}`}
              aria-label={searchOpen ? "关闭搜索" : "搜索文章"}
              title="搜索 · ⌘K"
              onClick={() => {
                setSearchOpen((value) => !value);
                setQuery("");
              }}
            >
              <MagnifyingGlassIcon size={24} />
            </button>
          </div>
          <p className="list-subtitle">
            {sourceId
              ? `${articles.length} 篇文章${activeSource?.kind === "demo" ? " · 示例订阅" : ""}`
              : view === "saved"
                ? `${articles.length} 篇值得再读的文章`
                : new Intl.DateTimeFormat("zh-CN", {
                    month: "long",
                    day: "numeric",
                    weekday: "long",
                  }).format(new Date())}
          </p>
          {searchOpen && (
            <div className="search-field">
              <MagnifyingGlassIcon size={17} />
              <input
                ref={search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Escape" &&
                    !event.nativeEvent.isComposing
                  ) {
                    setSearchOpen(false);
                    setQuery("");
                  }
                }}
                aria-label="搜索文章标题、摘要或来源"
                placeholder="搜索文章、来源"
              />
              <button
                className="icon-button"
                aria-label="清空搜索"
                onClick={() => {
                  setQuery("");
                  search.current?.focus();
                }}
              >
                <XIcon size={15} />
              </button>
            </div>
          )}
        </header>
        {updates.length > 0 && (
          <button
            className="updates-banner"
            onClick={() => mergeChanges(updates)}
          >
            {updates.reduce((n, c) => n + c.newCount, 0)
              ? `${updates.reduce((n, c) => n + c.newCount, 0)} 篇新文章 · 点击载入`
              : "订阅已刷新 · 点击载入"}
          </button>
        )}
        {desktop && activeSource && (
          <button
            className="unsubscribe-button quiet-button"
            onClick={async () => {
              try {
                await nativeSave?.flush();
                operation.current++;
                const result = await native.unsubscribe(activeSource.id);
                setLibrary(result.library);
                setSourceId(null);
                notify("已取消订阅，缓存文章和收藏仍保留");
              } catch (reason) {
                notify(String(reason));
              }
            }}
          >
            取消订阅
          </button>
        )}
        <div className="article-list-scroll">
          {articles.length ? (
            articles.map((item) => {
              const itemSource = library.sources.find(
                (source) => source.id === item.sourceId,
              );
              const unread = !library.read.includes(item.id);
              return (
                <button
                  key={item.id}
                  className={`article-row ${library.selectedId === item.id ? "selected" : ""} ${unread ? "unread" : "read"}`}
                  aria-current={
                    library.selectedId === item.id ? "true" : undefined
                  }
                  onClick={() => openArticle(item.id)}
                >
                  <span className="article-status">
                    {unread ? <CircleIcon weight="fill" size={11} /> : null}
                  </span>
                  <div className="article-row-content">
                    <h2
                      lang={item.title.startsWith("A small") ? "en" : "zh-CN"}
                    >
                      {item.title}
                    </h2>
                    <p className="article-excerpt">
                      {item.excerpt || "打开文章，继续阅读。"}
                    </p>
                    <div className="article-row-meta">
                      <span>{itemSource?.name}</span>
                      <span>·</span>
                      <time>
                        {item.date
                          ? new Intl.DateTimeFormat("zh-CN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "Asia/Shanghai",
                            }).format(new Date(item.date))
                          : "日期未知"}
                      </time>
                      {library.saved.includes(item.id) && (
                        <BookmarkSimpleIcon
                          className="row-bookmark"
                          size={14}
                          weight="fill"
                          aria-label="已收藏"
                        />
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="list-empty">
              {query ? (
                <MagnifyingGlassIcon size={31} weight="light" />
              ) : view === "saved" ? (
                <BookmarkSimpleIcon size={31} weight="light" />
              ) : (
                <ArchiveIcon size={31} weight="light" />
              )}
              <h2>
                {query
                  ? "没有找到相关文章"
                  : view === "saved"
                    ? "把好文章留下来"
                    : activeSource?.kind === "pending"
                      ? "订阅地址已保存"
                      : library.sources.length
                        ? "未读已清空"
                        : "从一份喜欢的订阅开始"}
              </h2>
              <p>
                {query
                  ? "试试更短的关键词，或搜索来源名称。"
                  : view === "saved"
                    ? "阅读时点击书签，值得重读的文章会出现在这里。"
                    : activeSource?.kind === "pending"
                      ? desktop
                        ? "点击左下角刷新订阅，获取最新文章。"
                        : "可以导入这个来源的 RSS 或 Atom 文件。"
                      : library.sources.length
                        ? "去全部文章看看，或添加一个新的订阅。"
                        : "添加博客或技术资讯，在本机安静阅读。"}
              </p>
              {!query && (
                <button
                  className="quiet-button"
                  onClick={() =>
                    activeSource?.kind === "pending"
                      ? setAddOpen(true)
                      : library.sources.length
                        ? navigate("all")
                        : setAddOpen(true)
                  }
                >
                  {activeSource?.kind === "pending"
                    ? "导入文章"
                    : library.sources.length
                      ? "浏览全部文章"
                      : "添加订阅"}
                </button>
              )}
            </div>
          )}
        </div>
      </section>
      <Reader
        article={article}
        source={source}
        saved={!!article && library.saved.includes(article.id)}
        read={!!article && library.read.includes(article.id)}
        preferences={library.preferences}
        focus={focus}
        position={article ? (positions.current[article.id] ?? 0) : 0}
        onSave={toggleSave}
        onRead={toggleRead}
        onFocus={() => setFocus((value) => !value)}
        onBack={() => setMobileReader(false)}
        onPreferences={(preferences) =>
          setLibrary((current) => ({ ...current, preferences }))
        }
        onPosition={(id, position) => {
          positions.current[id] = position;
          clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(
            () => persist(libraryRef.current),
            250,
          );
        }}
      />
      <SubscriptionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        demoAdded={library.sources.some(
          (source) => source.id === extraSource.id,
        )}
        onDemo={() => {
          setLibrary((current) => ({
            ...mergeImport(current, [extraSource], [extraArticle]),
            selectedId: extraArticle.id,
          }));
          setView("all");
          setSourceId(extraSource.id);
          setQuery("");
          notify("已添加慢写周刊示例订阅");
        }}
        onNativeFile={
          desktop
            ? async () => {
                const file = await native.readFile(false);
                return file
                  ? importFile(new File([file.contents], file.name))
                  : "";
              }
            : undefined
        }
        onAdd={async (input, name) => {
          const url = httpUrl(input.trim());
          if (!url) return "请输入有效的 http 或 https 订阅地址。";
          if (
            library.sources.some(
              (source) => source.url === url && !source.archived,
            )
          )
            return "这个订阅已经在阅读库中。";
          if (desktop) {
            try {
              const prepared = await native.prepare(url, name);
              const change = await native.commit(prepared);
              mergeChanges([change]);
              setSourceId(change.source.id);
              setView("all");
              setQuery("");
              notify(
                `已添加 ${change.source.name}，共 ${change.articles.length} 篇文章`,
              );
            } catch (reason) {
              return String(reason);
            }
            return;
          }
          const source = {
            id: `feed:${encodeURIComponent(url)}`,
            name: name.trim() || new URL(url).hostname,
            url,
            kind: "pending" as const,
          };
          setLibrary((current) => ({
            ...current,
            sources: [...current.sources, source],
            selectedId: null,
          }));
          setSourceId(source.id);
          setView("all");
          setQuery("");
          notify("订阅地址已保存，等待桌面版联网更新");
        }}
        onFile={importFile}
      />
      <Dialog.Root open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="shortcuts-dialog">
            <Dialog.Title>让阅读更顺手</Dialog.Title>
            <Dialog.Description>
              在正文或列表中使用，输入文字时不会触发。
            </Dialog.Description>
            <Dialog.Close
              className="icon-button dialog-close"
              aria-label="关闭快捷键"
            >
              <XIcon size={21} />
            </Dialog.Close>
            <dl className="shortcut-list">
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
                <dt>搜索文章</dt>
                <dd>
                  <kbd>⌘</kbd>
                  <kbd>K</kbd>
                </dd>
              </div>
              <div>
                <dt>退出专注 / 关闭弹窗</dt>
                <dd>
                  <kbd>Esc</kbd>
                </dd>
              </div>
            </dl>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <input
        type="file"
        ref={restoreInput}
        hidden
        accept=".json,application/json"
        aria-label="选择阅读库备份"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try {
            if (file.size > 5 * 1024 * 1024)
              throw new Error("备份不能超过 5 MB。");
            const data: unknown = JSON.parse(await file.text());
            if (!isLibrary(data))
              throw new Error("备份格式无效，当前阅读库保持不变。");
            setRestore(data);
          } catch (error) {
            notify(error instanceof Error ? error.message : "无法读取备份");
          } finally {
            event.target.value = "";
          }
        }}
      />
      <Dialog.Root
        open={!!restore}
        onOpenChange={(open) => {
          if (!open) setRestore(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="shortcuts-dialog">
            <Dialog.Title>恢复阅读库</Dialog.Title>
            <Dialog.Description>
              备份包含 {restore?.sources.length} 个订阅和{" "}
              {restore?.articles.length} 篇文章。
              {desktop
                ? "恢复将替换当前本地阅读库，并自动保留恢复前的备份。"
                : "恢复将替换当前浏览器中的阅读库；建议先导出当前备份。"}
            </Dialog.Description>
            <div className="confirm-actions">
              <button className="quiet-button" onClick={() => setRestore(null)}>
                取消
              </button>
              <button
                className="primary-button"
                onClick={async () => {
                  if (!restore) return;
                  if (desktop) {
                    try {
                      operation.current++;
                      await nativeSave?.flush();
                      const result = await native.import(restore, true);
                      nativeSave?.resetRevision(result.revision);
                      positions.current = result.library.positions;
                      setLibrary({
                        ...result.library,
                        preferences: normalizePreferences(
                          result.library.preferences,
                        ),
                      });
                      setUpdates([]);
                      setSourceId(null);
                      setView("all");
                      setRestore(null);
                      notify("阅读库已恢复，恢复前备份已保存");
                    } catch (reason) {
                      notify(String(reason));
                    }
                    return;
                  }
                  positions.current = restore.positions;
                  setLibrary({
                    ...restore,
                    preferences: normalizePreferences(restore.preferences),
                  });
                  setSourceId(null);
                  setView("all");
                  setRestore(null);
                  notify("阅读库已恢复");
                }}
              >
                使用此备份恢复
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {desktop && (
        <UpdateCenter
          open={updateOpen}
          onOpenChange={setUpdateOpen}
          preferences={library.preferences}
          onPreferences={(preferences) =>
            setLibrary((current) => ({ ...current, preferences }))
          }
          onAvailable={setNewVersion}
          libraryBusy={refreshing || addOpen || !!restore}
          onLock={(locked) => {
            if (locked) operation.current++;
            setInstallLocked(locked);
          }}
          save={async () => {
            clearTimeout(saveTimer.current);
            if (!nativeSave) throw new Error("阅读库尚未就绪。");
            nativeSave.enqueue({
              ...libraryRef.current,
              positions: { ...positions.current },
            });
            await nativeSave.flush();
            return nativeSave.getRevision();
          }}
        />
      )}
      <div
        className={`toast ${notice ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {notice}
      </div>
    </div>
  );
}
