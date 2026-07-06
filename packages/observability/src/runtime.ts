// Workaround for a kafkajs-on-Bun quirk: kafkajs sometimes schedules request
// timeouts with a negative delay, which Bun flags as a noisy TimeoutNegativeWarning.
// Clamping negatives to 0 removes the noise (a negative delay is meaningless and
// Node/Bun clamps it anyway) without suppressing any other warnings.
let installed = false;

export function clampNegativeTimeouts(): void {
  if (installed) return;
  installed = true;
  const orig = globalThis.setTimeout;
  type Handler = Parameters<typeof setTimeout>[0];
  globalThis.setTimeout = ((fn: Handler, delay?: number, ...args: unknown[]) =>
    orig(fn, typeof delay === "number" && delay < 0 ? 0 : delay, ...args)) as typeof setTimeout;
}
