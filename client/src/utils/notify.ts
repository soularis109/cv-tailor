const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function playDoneChime() {
  if (prefersReducedMotion()) return;
  try {
    const ctx = new AudioContext();
    [523, 659, 784].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.25, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  } catch {
    // AudioContext blocked (e.g. no user gesture) — skip silently
  }
}

export async function notifyDone(role: string) {
  const prev = document.title;
  document.title = `✓ Ready — ${role}`;
  setTimeout(() => {
    document.title = prev;
  }, 6000);

  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  if (Notification.permission === "granted") {
    new Notification("CV Ready!", { body: `Tailored for: ${role}` });
  }
}

export async function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }
}
