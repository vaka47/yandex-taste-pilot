export function compactNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function fullNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

export function relativeTime(value: string | null) {
  if (!value) return "время не указано";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} ч назад`;
  const days = Math.round(minutes / 1440);
  return days === 1 ? "вчера" : `${days} дн. назад`;
}

export function percent(numerator: number, denominator: number) {
  if (!denominator) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1).replace(".", ",")}%`;
}

export function shortDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(value));
}

