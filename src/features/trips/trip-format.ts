import type { Tone } from "@/features/operations/mock-data";

// Trip status theo doc §8: SCHEDULED, BOARDING, IN_PROGRESS, COMPLETED,
// CANCELLED, DISRUPTED. Giữ UNKNOWN làm fallback phòng thủ.
export type NormalizedTripStatus =
  | "IN_PROGRESS"
  | "BOARDING"
  | "SCHEDULED"
  | "COMPLETED"
  | "CANCELLED"
  | "DISRUPTED"
  | "UNKNOWN";

export function isoDateOf(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTimeHM(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

// Spec chỉ khai status: string → so khớp theo từ khóa, luôn có fallback.
export function normalizeTripStatus(
  status: string | null | undefined,
): NormalizedTripStatus {
  const normalized = (status ?? "").toLowerCase();

  if (normalized.includes("progress") || normalized.includes("ongoing")) {
    return "IN_PROGRESS";
  }

  // Kiểm "boarding" trước "cancel/complete" vì là chuỗi riêng, tránh lọt UNKNOWN.
  if (normalized.includes("boarding")) {
    return "BOARDING";
  }

  if (normalized.includes("cancel")) {
    return "CANCELLED";
  }

  if (normalized.includes("disrupt")) {
    return "DISRUPTED";
  }

  if (normalized.includes("complete") || normalized.includes("finish")) {
    return "COMPLETED";
  }

  if (normalized.includes("schedul") || normalized.includes("upcoming")) {
    return "SCHEDULED";
  }

  return "UNKNOWN";
}

export function tripStatusMeta(status: string | null | undefined): {
  label: string;
  tone: Tone;
} {
  switch (normalizeTripStatus(status)) {
    case "IN_PROGRESS":
      return { label: "Đang chạy", tone: "primary" };
    case "BOARDING":
      return { label: "Đang đón khách", tone: "primary" };
    case "COMPLETED":
      return { label: "Hoàn tất", tone: "success" };
    case "CANCELLED":
      return { label: "Đã hủy", tone: "danger" };
    case "DISRUPTED":
      return { label: "Gián đoạn", tone: "danger" };
    case "SCHEDULED":
      return { label: "Đã phân ca", tone: "info" };
    default:
      return { label: status ?? "Không rõ", tone: "neutral" };
  }
}

export function mapAssignmentRoleLabel(assignmentRole: string): string {
  const normalized = assignmentRole.toLowerCase();

  if (normalized.includes("driver")) {
    return "Tài xế";
  }

  if (normalized.includes("assistant") || normalized.includes("attendant")) {
    return "Phụ xe";
  }

  return assignmentRole;
}
