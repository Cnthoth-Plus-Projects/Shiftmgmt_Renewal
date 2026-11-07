export type ThemePreference = "system" | "dark";
interface ThemeState {
  getPreference(): ThemePreference;
  getResolvedTheme(): "light" | "dark";
  setPreference(value: ThemePreference): void;
  subscribe(listener: () => void): () => void;
}
declare global { interface Window { shiftmgmtTheme?: ThemeState } }

export function subscribeTheme(listener: () => void): () => void {
  return window.shiftmgmtTheme?.subscribe(listener) ?? (() => {});
}

export function createThemeControl(scope: "login" | "shell"): { element: HTMLElement; destroy: () => void } {
  const element = document.createElement("div");
  element.className = "theme-control";
  const button = document.createElement("button");
  button.type = "button";
  button.id = `theme-toggle-${scope}`;
  button.className = "theme-toggle";
  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined";
  icon.setAttribute("aria-hidden", "true");
  const names: Record<ThemePreference, string> = { system: "시스템", dark: "다크" };
  const icons: Record<ThemePreference, string> = { system: "desktop_windows", dark: "dark_mode" };
  const next: Record<ThemePreference, ThemePreference> = { system: "dark", dark: "system" };
  const sync = () => {
    const mode = window.shiftmgmtTheme?.getPreference() ?? "system";
    icon.textContent = icons[mode];
    button.dataset.mode = mode;
    button.title = `화면 테마: ${names[mode]} · 누르면 ${names[next[mode]]}`;
    button.setAttribute("aria-label", button.title);
  };
  sync();
  button.disabled = !window.shiftmgmtTheme;
  const change = () => {
    const state = window.shiftmgmtTheme;
    if (state) state.setPreference(next[state.getPreference()]);
  };
  button.addEventListener("click", change);
  const unsubscribe = subscribeTheme(sync);
  button.appendChild(icon);
  element.appendChild(button);
  return { element, destroy: () => { unsubscribe(); button.removeEventListener("click", change); } };
}
