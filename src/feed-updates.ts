import type { Changes } from "./desktop";
import type { Article, Library } from "./model";
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
export function discardImportedUpdates(current: Changes[], imported: Article[], visible: Article[]) {
  const importedIds = new Set(imported.map((article) => article.id));
  const visibleIds = new Set(visible.map((article) => article.id));
  return current.flatMap((change) => {
    const remaining = change.articles.filter((article) => !importedIds.has(article.id));
    if (!remaining.length) return [];
    if (remaining.length === change.articles.length) return [change];
    const alreadyLoaded = change.articles.filter((article) =>
      importedIds.has(article.id) && !visibleIds.has(article.id),
    ).length;
    return [{ ...change, articles: remaining, newCount: Math.max(0, change.newCount - alreadyLoaded) }];
  });
}
// Content refreshes cannot rewind newer reading facts or preferences from another UI action.
export function replaceContent(current: Library, canonical: Library): Library {
  return {
    ...current,
    sources: canonical.sources,
    articles: canonical.articles,
  };
}
