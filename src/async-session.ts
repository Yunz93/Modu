// Each task owns one result. Closing a view invalidates every late result from that view.
export function createAsyncSession() {
  let generation = 0;
  return {
    start() {
      const own = ++generation;
      return () => own === generation;
    },
    cancel() {
      generation++;
    },
  };
}
