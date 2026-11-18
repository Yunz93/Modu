// One writer, newest waiting snapshot wins. Failed snapshots stay pending for retry.
export function createSaveQueue<T>(
  write: (value: T) => Promise<void>,
  onError: (error: unknown) => void,
) {
  let pending: { value: T } | undefined;
  let running: Promise<void> | undefined;
  const flush = (): Promise<void> => {
    if (running) return running;
    if (!pending) return Promise.resolve();
    running = (async () => {
      while (pending) {
        const next = pending;
        pending = undefined;
        try {
          await write(next.value);
        } catch (error) {
          pending ??= next;
          onError(error);
          throw error;
        }
      }
    })().finally(() => {
      running = undefined;
    });
    return running;
  };
  return {
    enqueue(value: T) {
      pending = { value };
      void flush().catch(() => {});
    },
    flush,
  };
}
