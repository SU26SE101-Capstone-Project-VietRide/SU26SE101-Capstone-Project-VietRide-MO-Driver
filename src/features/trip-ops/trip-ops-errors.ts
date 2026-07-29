import { ApiError } from "@/api/client";

// Thông báo tiếng Việt cho các mã lỗi vận hành Day 39. Mã không có ở đây thì
// dùng message của backend (đã là tiếng Việt hoặc đủ rõ để hiển thị).
const MESSAGES: Record<string, string> = {
  TRIP_NOT_IN_PROGRESS: "Chuyến chưa khởi hành hoặc đã kết thúc.",
  TRIP_STOP_ALREADY_FINALIZED: "Điểm dừng này đã được ghi nhận trước đó.",
  TRIP_DESTINATION_ALREADY_ARRIVED: "Đã ghi nhận xe tới bến cuối rồi.",
  TRIP_ALREADY_TERMINAL: "Chuyến đã kết thúc rồi.",
  // Backend thực tế trả mã này khi complete chuyến chưa IN_PROGRESS (kiểm chứng
  // trên production 2026-07-21); tài liệu Invoice chỉ ghi TRIP_ALREADY_TERMINAL.
  TRIP_INVALID_TRANSITION: "Chuyến chưa khởi hành nên chưa thể hoàn tất.",
  DROP_OFF_STOP_NOT_ARRIVED:
    "Chưa tới điểm trả của kiện này. Xác nhận đã đến điểm dừng trước đã.",
  DESTINATION_TERMINAL_NOT_ARRIVED:
    "Chưa tới bến cuối. Xác nhận đã đến bến trước khi dỡ kiện.",
  INVALID_STATUS: "Kiện không ở trạng thái cho phép thao tác này.",
  // Parcel Settlement v2.
  PARCEL_CHECK_IN_CLOSED: "Đã quá giờ nhận kiện của chuyến này.",
  PARCEL_LOAD_CUTOFF_PASSED: "Đã quá giờ chốt xếp hàng, không cân lại được nữa.",
  FINAL_PAYMENT_DEADLINE_PASSED: "Khách đã quá hạn thanh toán phần còn thiếu.",
  BALANCE_ALREADY_PAID: "Khách đã thanh toán đủ phần còn thiếu rồi.",
  PAYMENT_ALREADY_STARTED: "Khoản thanh toán này đã được khởi tạo trước đó.",
  RACE_LOST: "Kiện vừa được cập nhật ở nơi khác, tải lại rồi thử tiếp.",
  IDEMPOTENCY_REQUEST_PENDING: "Yêu cầu trước đang được xử lý, đợi một chút.",
  TRIP_NOT_FOUND: "Không tìm thấy chuyến.",
  TRIP_STOP_NOT_FOUND: "Không tìm thấy điểm dừng này trong chuyến.",
  PARCEL_NOT_FOUND: "Không tìm thấy kiện hàng.",
  FORBIDDEN: "Bạn không được phân công cho chuyến này.",
};

// Đổi lỗi bất kỳ thành câu hiển thị được. null nghĩa là không có lỗi.
export function tripOpsErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }

  if (error instanceof ApiError) {
    return MESSAGES[error.code] ?? error.message;
  }

  return "Có lỗi xảy ra, thử lại sau.";
}

// Lấy lỗi đầu tiên trong nhiều mutation chạy song song.
export function firstErrorMessage(...errors: unknown[]): string | null {
  for (const error of errors) {
    const message = tripOpsErrorMessage(error);
    if (message) {
      return message;
    }
  }
  return null;
}
