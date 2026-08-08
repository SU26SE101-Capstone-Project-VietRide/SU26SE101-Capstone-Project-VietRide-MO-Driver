import type { Tone } from "@/features/operations/mock-data";

// type từ backend là string tự do → suy tông màu/nhãn theo từ khóa.
export function notificationToneOf(type: string): Tone {
  const normalized = type.toLowerCase();

  if (normalized.includes("delay") || normalized.includes("late")) {
    return "warning";
  }

  if (
    normalized.includes("cancel") ||
    normalized.includes("fail") ||
    normalized.includes("incident")
  ) {
    return "danger";
  }

  if (normalized.includes("parcel") || normalized.includes("cargo")) {
    return "info";
  }

  if (normalized.includes("shuttle")) {
    // SHUTTLE_WARNING / SHUTTLE_UNFULFILLED cần tone cảnh báo thay vì primary.
    if (normalized.includes("warning") || normalized.includes("unfulfilled")) {
      return "warning";
    }
    return "primary";
  }

  if (
    normalized.includes("schedule") ||
    normalized.includes("assign") ||
    normalized.includes("trip") ||
    normalized.includes("booking")
  ) {
    return "primary";
  }

  return "neutral";
}

// Nhãn hiển thị + tiêu chí lọc: dùng luôn type gốc, thay _ bằng khoảng trắng.
export function notificationBadgeOf(type: string): string {
  return type.replace(/[_-]+/g, " ").trim() || "Khác";
}

export function formatRelativeTime(iso: string, now: number): string {
  const time = new Date(iso).getTime();

  if (Number.isNaN(time)) {
    return "";
  }

  const diffMs = now - time;
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 1) {
    return "Vừa xong";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} phút trước`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} giờ trước`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} ngày trước`;
  }

  const date = new Date(iso);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}
