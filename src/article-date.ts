import type { Locale } from "./model";

export function createArticleDateFormatter(locale: Locale, now = new Date()) {
  const day = now.toDateString();
  const year = now.getFullYear();
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const monthDay = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (value: string) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const formatter = date.toDateString() === day
      ? time
      : date.getFullYear() === year ? monthDay : fullDate;
    return { label: formatter.format(date), dateTime: date.toISOString() };
  };
}
