export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "shieldray-theme";

/** Page canvas per mode (DESIGN.md `background`), used for browser and Telegram chrome. */
export const CANVAS_HEX: Record<ThemeMode, string> = { light: "#F0F0F1", dark: "#0E0D0E" };

/**
 * Runs before first paint (inlined in <head>): a saved choice wins, then the theme Telegram
 * passed in the launch address, then the OS setting. Kept dependency-free on purpose.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{
var d=document.documentElement,k=${JSON.stringify(THEME_STORAGE_KEY)},m=null;
if(String(location.hash).indexOf("tgWebAppData=")>=0){window.__SR_LAUNCH_HASH__=String(location.hash);}
try{m=localStorage.getItem(k);}catch(e){}
if(m!=="light"&&m!=="dark"){
  var h=String(location.hash||""),i=h.indexOf("tgWebAppThemeParams=");
  if(i>=0){try{var p=JSON.parse(decodeURIComponent(new URLSearchParams(h.slice(i)).get("tgWebAppThemeParams")||"{}"));
    var c=String(p.bg_color||"");if(/^#[0-9a-f]{6}$/i.test(c)){var n=parseInt(c.slice(1),16);
    m=((n>>16)*299+((n>>8&255)*587)+((n&255)*114))/1000<128?"dark":"light";}}catch(e){}}
}
if(m!=="light"&&m!=="dark"){m=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}
d.setAttribute("data-theme","mouve-"+m);d.classList.remove("light","dark");d.classList.add(m);d.style.colorScheme=m;
}catch(e){}})();`;

export function currentTheme(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  root.setAttribute("data-theme", `mouve-${mode}`);
  root.classList.remove("light", "dark");
  root.classList.add(mode);
  root.style.colorScheme = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", CANVAS_HEX[mode]);
}

export function saveTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Private mode or blocked storage: the choice simply lasts for this visit.
  }
}

export function hasSavedTheme(): boolean {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark";
  } catch {
    return false;
  }
}
