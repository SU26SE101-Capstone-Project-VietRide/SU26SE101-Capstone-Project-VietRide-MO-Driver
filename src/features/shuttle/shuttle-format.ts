import type { Tone } from "@/features/operations/mock-data";

// Đây là app tiếng Việt: enum thô của backend lòi lên màn hình là bug. Giá trị
// lạ (BE thêm sau) chỉ log ở dev, UI hiện câu tiếng Việt chung chung.
function unknownEnum(kind: string, value: string | null | undefined): void {
  if (__DEV__ && value != null && value !== "") {
    console.warn(
      `[shuttle-format] chưa có label tiếng Việt cho ${kind}: ${value}`,
    );
  }
}

// Nhãn + tông màu cho trạng thái ShuttleTrip.
export function shuttleTripStatusOf(status: string): {
  label: string;
  tone: Tone;
} {
  switch (status) {
    case "SCHEDULED":
      return { label: "Chờ khởi hành", tone: "info" };
    case "IN_PROGRESS":
      return { label: "Đang chạy", tone: "primary" };
    case "COMPLETED":
      return { label: "Hoàn tất", tone: "success" };
    case "CANCELLED":
      return { label: "Đã hủy", tone: "danger" };
    default:
      unknownEnum("trạng thái chuyến trung chuyển", status);
      return { label: "Không rõ trạng thái", tone: "neutral" };
  }
}

// Nhãn + tông màu cho trạng thái 1 pickup group trong manifest.
export function shuttleStopStatusOf(status: string): {
  label: string;
  tone: Tone;
} {
  switch (status) {
    case "PENDING":
      return { label: "Chờ đón", tone: "info" };
    case "PICKED_UP":
      return { label: "Đã đón", tone: "primary" };
    case "DELIVERED":
      return { label: "Đã trả khách", tone: "success" };
    case "NO_SHOW":
      return { label: "Vắng mặt", tone: "warning" };
    case "CANCELLED":
      return { label: "Đã hủy", tone: "danger" };
    default:
      unknownEnum("trạng thái điểm đón", status);
      return { label: "Không rõ trạng thái", tone: "neutral" };
  }
}

// Chiều chạy của shuttle. v1 backend chỉ có INBOUND nhưng list đã trả
// OUTBOUND_FROM_STATION nên hỗ trợ cả hai.
export function shuttleDirectionLabelOf(direction: string): string {
  switch (direction) {
    case "INBOUND_TO_STATION":
      return "Đón khách về bến";
    case "OUTBOUND_FROM_STATION":
      return "Trả khách từ bến";
    default:
      unknownEnum("chiều chạy trung chuyển", direction);
      return "Chuyến trung chuyển";
  }
}
