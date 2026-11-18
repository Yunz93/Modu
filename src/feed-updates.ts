import type { Changes } from "./desktop";
import type { Library } from "./model";
export function queueUpdates(
  current: Changes[],
  incoming: Changes[],
): Changes[] {
  const bySource = new Map(current.map((change) => [change.source.id, change]));
  for (const change of incoming) {
    const old = bySource.get(change.source.id);
    const articles = new Map(
      [...(old?.articles ?? []), ...change.articles].map((article) => [
        article.id,
        article,
      ]),
    );
    bySource.set(change.source.id, {
      ...change,
      articles: [...articles.values()],
      newCount: (old?.newCount ?? 0) + change.newCount,
    });
  }
  return [...bySource.values()];
}
// Content refreshes cannot rewind newer reading facts or preferences from another UI action.
export function replaceContent(current: Library, canonical: Library): Library {
  return {
    ...current,
    sources: canonical.sources,
    articles: canonical.articles,
  };
}
