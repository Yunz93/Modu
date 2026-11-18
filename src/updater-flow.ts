export type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number | null } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Verifying" | "Ready" };
export type DownloadProgress = {
  received: number;
  total: number | null;
  verifying: boolean;
};
export function advanceProgress(
  current: DownloadProgress,
  event: DownloadEvent,
): DownloadProgress {
  if (event.event === "Started")
    return {
      received: 0,
      total:
        event.data.contentLength && event.data.contentLength > 0
          ? event.data.contentLength
          : null,
      verifying: false,
    };
  if (event.event === "Progress")
    return {
      ...current,
      received: current.received + Math.max(0, event.data.chunkLength),
    };
  return { ...current, verifying: true };
}
export async function installPreparedUpdate(actions: {
  lock: (locked: boolean) => void;
  save: () => Promise<number>;
  install: (revision: number) => Promise<void>;
  timeoutMs?: number;
}) {
  actions.lock(true);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const revision = await Promise.race([
      actions.save(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("保存阅读进度超时，已取消安装。请稍后重试。")),
          actions.timeoutMs ?? 15_000,
        );
      }),
    ]);
    clearTimeout(timer);
    await actions.install(revision);
  } finally {
    clearTimeout(timer);
    actions.lock(false);
  }
}
