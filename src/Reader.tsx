import { useTranslation } from "./locale-context";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  BookmarkSimpleIcon,
  CheckIcon,
  CheckCircleIcon,
  FileTextIcon,
  NewspaperIcon,
  MoonIcon,
  SunIcon,
  TextAaIcon,
} from "@phosphor-icons/react";
import { cleanArticleHtml, prepareFeedBody } from "./feed-import";
import { desktop, native } from "./desktop";
import { presentArticle } from "./article-presentation";
import { watchReaderMedia } from "./reader-media";
import { ReadingSettings, useFontChoices } from "./TypographySettings";
import type { Article, Preferences, Source } from "./model";

type Props = {
  article?: Article;
  source?: Source;
  saved: boolean;
  read: boolean;
  focus: boolean;
  effectiveTheme: Preferences["theme"];
  preferences: Preferences;
  getPosition: (key: string) => number;
  onSave: () => void;
  onRead: () => void;
  onFullText?: (refresh?: boolean) => void;
  fetchingFullText: boolean;
  onFocus: () => void;
  onBack: () => void;
  onPreferences: (preferences: Partial<Preferences>) => void;
  onPosition: (id: string, position: number) => void;
};

export function Reader({
  article,
  source,
  saved,
  read,
  focus,
  effectiveTheme,
  preferences,
  getPosition,
  onSave,
  onRead,
  onFullText,
  fetchingFullText,
  onFocus,
  onBack,
  onPreferences,
  onPosition,
}: Props) {
  const { t, locale } = useTranslation();
  const night = effectiveTheme === "night";
  const themeLabel = t(night ? "切换到浅色主题" : "切换到深色主题");
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [openFullTextKey, setOpenFullTextKey] = useState<string>();
  // Keep existing per-article positions compatible with older reading libraries.
  const fullTextKey = article ? `\0full-text:${JSON.stringify([article.id, article.url])}` : undefined;
  const showFullText = Boolean(article?.fullTextHtml && openFullTextKey === fullTextKey);
  const positionKey = showFullText ? fullTextKey : article?.id;
  const fonts = useFontChoices(appearanceOpen);
  const appearancePanel = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const articleBody = useRef<HTMLDivElement>(null);
  const restoring = useRef(false);
  const readPosition = useRef(getPosition);
  readPosition.current = getPosition;
  const articleBase = article?.url ?? source?.url;
  const feedBody = useMemo(
    () => prepareFeedBody(article?.html ?? "", articleBase, article?.hasInlineContent),
    [article?.html, articleBase, article?.hasInlineContent],
  );
  const fullTextBody = useMemo(
    () => article?.fullTextHtml ? cleanArticleHtml(article.fullTextHtml, articleBase) : "",
    [article?.fullTextHtml, articleBase],
  );
  const activeHtml = showFullText ? fullTextBody : feedBody.markup.__html;
  const markup = useMemo(() => ({
    __html: presentArticle(activeHtml, articleBase, {
      copy: t("复制代码"),
      embed: t("打开嵌入内容"),
      attachment: t("打开附件"),
    }),
  }), [activeHtml, articleBase, t]);
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => {
    const body = articleBody.current;
    const id = article?.id;
    if (!body) return;
    return watchReaderMedia(body, {
      retryImage: desktop && showFullText && id ? (url) => native.fullTextImage(id, url) : undefined,
      imageFailed: t("图片加载失败"),
      mediaFailed: t("媒体加载失败"),
      captionsFailed: t("字幕加载失败"),
      openMedia: t("打开原始媒体"),
    });
  }, [article?.id, markup, showFullText, t]);
  useLayoutEffect(() => {
    const viewport = scroll.current;
    const body = articleBody.current;
    if (!viewport || !body || !positionKey) return;
    const target = readPosition.current(positionKey);
    restoring.current = true;
    viewport.scrollTop = target;
    const frame = requestAnimationFrame(() => { restoring.current = false; });
    // A cached article's images may establish their height after the first layout.
    if (viewport.scrollTop >= target - 1) return () => cancelAnimationFrame(frame);
    const observer = new ResizeObserver(() => {
      if (viewport.scrollHeight - viewport.clientHeight + 1 < target) return;
      viewport.scrollTop = target;
      stopWaiting();
    });
    const intentEvents = ["wheel", "pointerdown", "touchstart", "keydown"] as const;
    function stopWaiting() {
      observer.disconnect();
      clearTimeout(timeout);
      intentEvents.forEach((event) => viewport?.removeEventListener(event, stopWaiting));
    }
    const timeout = setTimeout(stopWaiting, 5_000);
    intentEvents.forEach((event) => viewport.addEventListener(event, stopWaiting, { passive: true }));
    observer.observe(body);
    return () => {
      stopWaiting();
      cancelAnimationFrame(frame);
    };
  }, [positionKey, articleBase]);

  async function copyCode(button: HTMLButtonElement) {
    const code = button.parentElement?.querySelector("pre")?.textContent;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const field = document.createElement("textarea");
      field.value = code;
      field.className = "sr-only";
      field.setAttribute("readonly", "");
      const previous = document.activeElement;
      document.body.append(field);
      field.select();
      let copied = false;
      try { copied = document.execCommand("copy"); } catch { /* Use the failure message below. */ }
      field.remove();
      if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
      if (!copied) {
        setCopyStatus(t("复制失败"));
        return;
      }
    }
    if (button.isConnected) button.textContent = t("已复制");
    setCopyStatus(t("代码已复制"));
  }

  return (
    <section className="reader" aria-label={t("文章阅读区")} id="main-content">
      <div className="reader-toolbar">
        <div className="reader-nav-actions">
          <button
            className="icon-button mobile-back"
            aria-label={t("返回文章列表")}
            onClick={onBack}
          >
            <ArrowLeftIcon size={22} />
          </button>
          {focus && (
            <button
              className="icon-button exit-focus"
              aria-label={t("退出专注")}
              title={t("退出专注 · Esc")}
              onClick={onFocus}
            >
              <ArrowsInSimpleIcon size={22} aria-hidden="true" />
            </button>
          )}
          {article?.fullTextHtml && (
            <button
              className="icon-button full-text-switch"
              title={t(showFullText ? "返回订阅内容" : "查看已缓存全文")}
              aria-label={t(showFullText ? "返回订阅内容" : "查看已缓存全文")}
              onClick={() => setOpenFullTextKey(showFullText ? undefined : fullTextKey)}
            >
              {showFullText
                ? <NewspaperIcon size={22} aria-hidden="true" />
                : <FileTextIcon size={22} aria-hidden="true" />}
            </button>
          )}
        </div>
        <div className="reader-actions">
          <button
            className="icon-button"
            aria-label={themeLabel}
            title={themeLabel}
            onClick={() => onPreferences({ theme: night ? "paper" : "night", followSystemTheme: false })}
          >
            {night ? <SunIcon size={22} aria-hidden="true" /> : <MoonIcon size={22} aria-hidden="true" />}
          </button>
          <button
            className={`icon-button bookmark-button ${saved ? "is-saved" : ""}`}
            disabled={!article}
            aria-label={saved ? t("取消收藏") : t("收藏文章")}
            aria-pressed={saved}
            title={saved ? t("取消收藏 · S") : t("收藏 · S")}
            onClick={onSave}
          >
            <BookmarkSimpleIcon size={23} weight={saved ? "fill" : "regular"} />
          </button>
          <Popover.Root open={appearanceOpen} onOpenChange={setAppearanceOpen}>
            <Popover.Trigger asChild>
              <button
                className="icon-button appearance-button"
                aria-label={t("阅读外观")}
                title={t("阅读外观")}
              >
                <TextAaIcon size={27} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                ref={appearancePanel}
                className="appearance-popover"
                aria-label={t("阅读外观")}
                align="end"
                sideOffset={8}
                collisionPadding={12}
                tabIndex={-1}
                onOpenAutoFocus={(event) => {
                  event.preventDefault();
                  appearancePanel.current?.focus({ preventScroll: true });
                }}
              >
                <ReadingSettings
                  compact
                  fonts={fonts}
                  preferences={preferences}
                  onChange={onPreferences}
                />
                <Popover.Arrow className="popover-arrow" />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <a
            className={`icon-button original-link ${article?.url ? "" : "is-disabled"}`}
            href={article?.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("在浏览器中打开")}
            aria-disabled={!article?.url}
            title={article?.url ? t("在浏览器中打开") : t("示例文章没有外部原文")}
            onClick={(event) => {
              if (!article?.url) event.preventDefault();
            }}
          >
            <ArrowSquareOutIcon size={21} aria-hidden="true" />
          </a>
          {!focus && (
            <button
              className="icon-button focus-button"
              aria-label={t("专注模式")}
              title={t("专注模式 · F")}
              onClick={onFocus}
            >
              <ArrowsOutSimpleIcon size={22} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div
        className="reader-scroll"
        ref={scroll}
        onScroll={() => {
          if (positionKey && scroll.current && !restoring.current)
            onPosition(positionKey, scroll.current.scrollTop);
        }}
      >
        {article ? (
          <article
            className={`article-document font-${preferences.font}`}
          >
            <header className="article-heading">
              <h1 lang={article.title.startsWith("A small") ? "en" : "zh-CN"}>
                {article.title}
              </h1>
              <div className="article-byline">
                <span className="article-source" title={source?.name}>{source?.name}</span>
                {article.demo && (
                  <>
                    <span className="byline-dot">·</span>
                    <span>{t("示例内容")}</span>
                  </>
                )}
                {article.date && (
                  <>
                    <span className="byline-separator" />
                    <time dateTime={article.date}>
                      {new Intl.DateTimeFormat(locale, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      }).format(new Date(article.date))}
                    </time>
                  </>
                )}
                {article.url && !article.fullTextHtml && onFullText && !feedBody.complete && (
                  <button
                    className="full-text-action"
                    disabled={fetchingFullText}
                    onClick={() => {
                      setOpenFullTextKey(fullTextKey);
                      onFullText();
                    }}
                  >{t(fetchingFullText ? "正在获取全文…" : "获取全文")}</button>
                )}
                {showFullText && onFullText && (
                  <button className="full-text-action" disabled={fetchingFullText} onClick={() => onFullText(true)}>
                    {t(fetchingFullText ? "正在获取全文…" : "重新获取全文")}
                  </button>
                )}
              </div>
            </header>
            <div
              key={positionKey}
              ref={articleBody}
              onClick={(event) => {
                if (!(event.target instanceof Element)) return;
                const copy = event.target.closest<HTMLButtonElement>("button.reader-copy-code");
                if (copy) {
                  setCopyStatus("");
                  void copyCode(copy);
                  return;
                }
                const href = event.target.closest("a[href]")?.getAttribute("href");
                if (!href?.startsWith("#modu-reader-anchor-")) return;
                event.preventDefault();
                const target = event.currentTarget.querySelector(href);
                if (target instanceof HTMLElement) {
                  target.tabIndex = -1;
                  target.focus({ preventScroll: true });
                  target.scrollIntoView({ block: "start" });
                }
              }}
              className="article-body"
              dangerouslySetInnerHTML={markup}
            />
            <span className="sr-only" role="status">{copyStatus}</span>
            <footer className="article-footer">
              <span>{t("读到这里，留一点时间想一想。")}</span>
              <button className="quiet-button" onClick={onRead}>
                {read ? <CheckCircleIcon size={18} /> : <CheckIcon size={18} />}
                {read ? t("标为未读") : t("标为已读")}
              </button>
            </footer>
          </article>
        ) : (
          <div className="reader-empty">
            <BookmarkSimpleIcon size={36} weight="light" />
            <h2>{t("留一点时间，读点好内容")}</h2>
            <p>{t("从左侧选择一篇文章，开始阅读。")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
