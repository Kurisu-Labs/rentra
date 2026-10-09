export function formatIDR(wei?: bigint | null): string {
  if (wei === undefined || wei === null) return "—";
  const whole = wei / 10n ** 18n;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(whole);
}

export function rpToWei(input: string): bigint {
  const digits = input.replace(/[^\d]/g, "");
  if (!digits) return 0n;
  return BigInt(digits) * 10n ** 18n;
}

export function shortAddr(value?: string | null): string {
  if (!value) return "";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function unixToLocalInput(unix: number): string {
  const date = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localInputToUnix(value: string): bigint {
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) throw new Error("Tanggal tidak valid");
  return BigInt(Math.floor(ms / 1000));
}

export function formatWhen(unix?: bigint | number | null): string {
  if (unix === undefined || unix === null) return "—";
  const n = typeof unix === "bigint" ? Number(unix) : unix;
  if (!n) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(n * 1000));
}

export function errText(error: unknown): string {
  if (error && typeof error === "object" && "shortMessage" in error) {
    const message = (error as { shortMessage?: unknown }).shortMessage;
    if (typeof message === "string" && message.length > 0) return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Terjadi kesalahan. Coba lagi.";
}

export function asBigint(value: unknown): bigint | undefined {
  if (typeof value === "bigint") return value;
  return undefined;
}

export function tupleAt(value: unknown, index: number): unknown {
  if (Array.isArray(value)) return value[index];
  return undefined;
}
