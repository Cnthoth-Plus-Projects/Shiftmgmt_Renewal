// Runs before the first stylesheet/body paint. No app/session dependency.
(() => {
  const key = "shiftmgmt.theme";
  const root = document.documentElement;
  const listeners = new Set();
  const normalize = value => value === "dark" ? "dark" : "system";
  let preference = "system", media;
  try {
    const saved = localStorage.getItem(key);
    preference = normalize(saved);
    if (saved === "light") localStorage.setItem(key, preference);
  } catch { /* Memory-only preference. */ }
  try { media = window.matchMedia("(prefers-color-scheme: dark)"); } catch { /* Light fallback. */ }
  const resolve = () => {
    if (preference !== "system") return preference;
    try { return media?.matches ? "dark" : "light"; } catch { return "light"; }
  };
  let resolved = resolve();
  const publish = () => {
    const next = resolve();
    const changed = root.dataset.themePreference !== preference || resolved !== next;
    resolved = next;
    root.dataset.theme = resolved;
    root.dataset.themePreference = preference;
    if (changed) for (const listener of listeners) listener();
  };
  const setPreference = value => {
    preference = normalize(value);
    try { localStorage.setItem(key, preference); } catch { /* Apply in this window even if storage is unavailable. */ }
    publish();
  };
  publish();
  try {
    if (media?.addEventListener) media.addEventListener("change", publish);
    else media?.addListener?.(publish);
  } catch { /* Manual selection remains available. */ }
  window.addEventListener("storage", event => {
    if (event.key !== key && event.key !== null) return;
    preference = normalize(event.newValue);
    publish();
  });
  window.shiftmgmtTheme = Object.freeze({
    getPreference: () => preference,
    getResolvedTheme: () => resolved,
    setPreference,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }
  });
})();
