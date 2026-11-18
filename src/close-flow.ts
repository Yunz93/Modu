export async function closeAfterSaving(actions: {
  save: () => Promise<void>;
  exit: () => Promise<void>;
  timeoutMs?: number;
}) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      actions.save(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("保存超时，应用保持打开。")),
          actions.timeoutMs ?? 15000,
        );
      }),
    ]);
    await actions.exit();
  } finally {
    clearTimeout(timer);
  }
}
export async function closeAfterExport(actions: {
  export: () => Promise<boolean>;
  exit: () => Promise<void>;
}) {
  if (await actions.export()) {
    await actions.exit();
    return true;
  }
  return false;
}
