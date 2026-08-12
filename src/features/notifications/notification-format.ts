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

// Nhãn tiếng Việt cho các NotificationType crew hay gặp (API-Notification.md).
// Nhãn ngắn vì dùng làm badge trên card VÀ chip lọc đầu trang.
const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  TRIP_ASSIGNED: "Phân công chuyến",
  TRIP_ASSIGNMENT_REMOVED: "Hủy phân công",
  DRIVER_SCHEDULE_EDITED: "Đổi lịch làm việc",
  OPERATOR_ANNOUNCEMENT: "Điều hành",
  TRIP_BOARDING_REMINDER: "Nhắc soát vé",
  TRIP_ROUTE_CHANGED: "Đổi tuyến",
  TRIP_SCHEDULE_CHANGED: "Đổi giờ chạy",
  TRIP_CANCELLED: "Hủy chuyến",
  TRIP_DELAYED: "Chuyến trễ",
  TRIP_DELAYED_ALERT: "Chuyến trễ",
  TRIP_DISRUPTED: "Chuyến gián đoạn",
  TRIP_VEHICLE_APPROACHING: "Xe sắp tới",
  STOP_DISABLED: "Điểm dừng đóng",
  VEHICLE_SUBSTITUTED: "Đổi xe",
  VEHICLE_SWAPPED: "Đổi xe",
  BOOKING_CONFIRMED: "Booking mới",
  BOOKING_CREATED: "Booking mới",
  BOOKING_CANCELLED: "Booking hủy",
  BOOKING_DISRUPTED: "Booking gián đoạn",
  BOOKING_TRANSFERRED: "Chuyển booking",
  PASSENGER_BOARDED: "Khách lên xe",
  PASSENGER_NO_SHOW: "Khách vắng mặt",
  PARCEL_LOADED: "Kiện hàng",
  PARCEL_IN_TRANSIT: "Kiện hàng",
  PARCEL_DELIVERED_PENDING_CONFIRM: "Kiện chờ xác nhận",
  PARCEL_REJECTED: "Kiện bị từ chối",
  PARCEL_RETURNED: "Kiện hoàn trả",
  CARGO_NEAR_FULL_ALERT: "Khoang hàng gần đầy",
  SHUTTLE_ASSIGNED: "Trung chuyển",
  SHUTTLE_UNFULFILLED: "Trung chuyển thiếu xe",
  SHUTTLE_WARNING: "Cảnh báo trung chuyển",
  INCIDENT_REPORTED: "Sự cố",
  OFF_ROUTE_ALERT: "Lệch tuyến",
  DRIVER_STOP_DEPARTED_WITH_PENDING: "Rời điểm còn khách",
};

// Nhãn hiển thị + tiêu chí lọc. Type có trong bảng thì dùng nhãn tiếng Việt;
// type mới/lạ thì đoán nhóm theo từ khóa, bí quá gom vào "Khác" — không hiển
// thị type thô tiếng Anh (app 100% tiếng Việt).
export function notificationBadgeOf(type: string): string {
  const known = NOTIFICATION_TYPE_LABELS[type.toUpperCase()];
  if (known) {
    return known;
  }

  const normalized = type.toLowerCase();
  if (normalized.includes("parcel") || normalized.includes("cargo")) {
    return "Kiện hàng";
  }
  if (normalized.includes("shuttle")) {
    return "Trung chuyển";
  }
  if (normalized.includes("booking") || normalized.includes("passenger")) {
    return "Đặt vé";
  }
  if (normalized.includes("trip") || normalized.includes("schedule")) {
    return "Chuyến đi";
  }

  if (normalized.includes("invoice") || normalized.includes("payment")) {
    return "Thanh toán";
  }
  return "Khác";
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
