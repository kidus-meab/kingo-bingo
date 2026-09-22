export type TelegramUser = {
  id: number;
  first_name: string;
  username?: string | null;
  photo_url?: string | null;
};

export function getTelegramWebApp() {
  if (typeof window === "undefined") return undefined;
  return window.Telegram?.WebApp;
}

export function getTelegramInitData() {
  return getTelegramWebApp()?.initData ?? "";
}

export function getUnsafeTelegramUser(): TelegramUser | undefined {
  const user = getTelegramWebApp()?.initDataUnsafe?.user;
  if (!user) return undefined;

  return {
    id: user.id,
    first_name: user.first_name,
    username: user.username ?? null,
    photo_url: user.photo_url ?? null,
  };
}

export function isInsideTelegram() {
  return Boolean(getTelegramInitData());
}

function cssColorToHex(color: string) {
  const value = color.trim();
  if (/^#([0-9a-f]{6})$/i.test(value)) return value;
  if (/^#([0-9a-f]{3})$/i.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }

  const rgb = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgb) return null;

  const toHex = (channel: string) =>
    Number(channel).toString(16).padStart(2, "0");

  return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
}

export function applyTelegramTheme() {
  const webApp = getTelegramWebApp();
  if (!webApp) return;

  const styles = getComputedStyle(document.documentElement);
  const theme = cssColorToHex(styles.getPropertyValue("--theme"));
  const background = cssColorToHex(
    getComputedStyle(document.body).backgroundColor,
  );

  if (theme) webApp.setHeaderColor(theme);
  if (background) webApp.setBackgroundColor(background);
}

export function bootstrapTelegramWebApp() {
  const webApp = getTelegramWebApp();
  if (!webApp) return false;

  webApp.ready();
  webApp.expand();
  webApp.disableVerticalSwipes?.();
  applyTelegramTheme();
  return true;
}

export function hapticImpact(style: "light" | "medium" | "heavy" = "medium") {
  getTelegramWebApp()?.HapticFeedback?.impactOccurred(style);
}

export function hapticNotify(type: "error" | "success" | "warning") {
  getTelegramWebApp()?.HapticFeedback?.notificationOccurred(type);
}

let backHandler: (() => void) | null = null;

export function setTelegramBackButton(handler: (() => void) | null) {
  const button = getTelegramWebApp()?.BackButton;
  if (!button) return;

  if (backHandler) {
    button.offClick(backHandler);
    backHandler = null;
  }

  if (!handler) {
    button.hide();
    return;
  }

  backHandler = handler;
  button.onClick(handler);
  button.show();
}
