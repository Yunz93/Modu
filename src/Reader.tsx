import { useTranslation } from "./locale-context";
import { useEffect, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  BookmarkSimpleIcon,
  CheckIcon,
  CheckCircleIcon,
  TextAaIcon,
} from "@phosphor-icons/react";
import { cleanArticleHtml } from "./feed-import";
import { ReadingSettings, useFontChoices } from "./TypographySettings";
import type { Article, Preferences, Source } from "./model";

type Props = {
  article?: Article;
  source?: Source;
  saved: boolean;
  read: boolean;
  focus: boolean;
  preferences: Preferences;
  position: number;
  onSave: () => void;
  onRead: () => void;
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
  preferences,
  position,
  onSave,
  onRead,
  onFocus,
  onBack,
  onPreferences,
  onPosition,
}: Props) {
  const { t, locale } = useTranslation();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const fonts = useFontChoices(appearanceOpen);
  const scroll = useRef<HTMLDivElement>(null);
  const restoring = useRef(false);
  const initialPosition = useRef(position);
  initialPosition.current = position;
  const html = useMemo(
    () => cleanArticleHtml(article?.html ?? "", article?.url),
    [article?.html, article?.url],
  );
  useEffect(() => {
    restoring.current = true;
    const frame = requestAnimationFrame(() => {
      if (scroll.current) scroll.current.scrollTop = initialPosition.current;
      restoring.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [article?.id]);

  return (
    <section className="reader" aria-label={t("文章阅读区")} id="main-content">
      <div className="reader-toolbar">
        <button
          className="icon-button mobile-back"
          aria-label={t("返回文章列表")}
          onClick={onBack}
        >
          <ArrowLeftIcon size={22} />
        </button>
        {focus && (
          <button className="quiet-button exit-focus" onClick={onFocus}>
            <ArrowsInSimpleIcon size={19} />
            <span>{t("退出专注")}</span>
            <kbd>Esc</kbd>
          </button>
        )}
        <div className="reader-actions">
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
          <span className="toolbar-divider" />
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
                className="appearance-popover"
                align="end"
                sideOffset={12}
                collisionPadding={12}
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
          <span className="toolbar-divider" />
          <a
            className={`quiet-button original-link ${article?.url ? "" : "is-disabled"}`}
            href={article?.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!article?.url}
            title={article?.url ? t("在浏览器中打开") : t("示例文章没有外部原文")}
            onClick={(event) => {
              if (!article?.url) event.preventDefault();
            }}
          >
            <ArrowSquareOutIcon size={21} />
            <span>{t("在浏览器中打开")}</span>
          </a>
          <span className="toolbar-divider focus-divider" />
          <button
            className="quiet-button focus-button"
            aria-pressed={focus}
            title={t("专注模式 · F")}
            onClick={onFocus}
          >
            {focus ? (
              <ArrowsInSimpleIcon size={22} />
            ) : (
              <ArrowsOutSimpleIcon size={22} />
            )}
            <span>{focus ? t("退出专注") : t("专注模式")}</span>
          </button>
        </div>
      </div>
      <div
        className="reader-scroll"
        ref={scroll}
        onScroll={() => {
          if (article && scroll.current && !restoring.current)
            onPosition(article.id, scroll.current.scrollTop);
        }}
      >
        {article ? (
          <article
            className={`article-document font-${preferences.font}`}
            style={
              {
                "--reading-size": `${preferences.fontSize}px`,
              } as React.CSSProperties
            }
          >
            <header className="article-heading">
              <h1 lang={article.title.startsWith("A small") ? "en" : "zh-CN"}>
                {article.title}
              </h1>
              <p className="article-byline">
                <span>{source?.name}</span>
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
              </p>
            </header>
            <div
              className="article-body"
              dangerouslySetInnerHTML={{ __html: html }}
            />
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
