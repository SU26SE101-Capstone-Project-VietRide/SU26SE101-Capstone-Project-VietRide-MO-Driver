import { ApiError, apiErrorDisplayMessage } from "@/api/client";

// Thông báo tiếng Việt cho các mã lỗi vận hành. Mã không có ở đây rơi về câu
// chung kèm mã lỗi (apiErrorDisplayMessage) — không hiển thị message tiếng Anh
// thô của backend.
const MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: "Dữ liệu gửi lên không hợp lệ. Kiểm tra lại thông tin.",
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
  // Crew transfer/confirm/email + cargo ledger (API-Parcel_NEWST.md).
  PARCEL_NOT_PENDING_CONFIRM:
    "Kiện chưa ở bước chờ người nhận xác nhận nên không thao tác được.",
  RESOURCE_CONFLICT: "Kiện vừa được cập nhật ở nơi khác, tải lại rồi thử tiếp.",
  PARCEL_NOT_TRANSFERABLE:
    "Kiện không ở trạng thái chờ nhận chuyển. Tải lại danh sách rồi kiểm tra.",
  PARCEL_TRANSFER_CONFIRMATION_DEADLINE_PASSED:
    "Đã quá hạn xác nhận nhận kiện chuyển đến. Liên hệ điều hành xử lý.",
  PARCEL_CARGO_RECOVERY_IN_PROGRESS:
    "Hệ thống đang phục hồi dữ liệu khoang hàng của kiện, thử lại sau ít phút.",
  TRIP_CARGO_TRANSFER_CONFLICT:
    "Khoang hàng của chuyến đang có thao tác chuyển kiện xung đột, thử lại sau.",
  TRIP_CARGO_CAPACITY_EXCEEDED:
    "Khoang hàng của chuyến không còn đủ chỗ cho kiện này. Liên hệ điều hành.",
  PARCEL_RECIPIENT_EMAIL_REQUIRED:
    "Kiện không có email người nhận nên không gửi lại email xác nhận được.",
  PARCEL_DELIVERY_REJECTED_WINDOW_EXPIRED:
    "Người nhận đã từ chối kiện này, không gửi lại email xác nhận được nữa.",
  DROP_OFF_STOP_NOT_FOUND: "Không tìm thấy điểm trả của kiện trong chuyến.",
  DROP_OFF_STOP_NOT_ALLOWED: "Điểm dừng này không cho phép trả kiện.",
  // Backend trả code này khi ảnh bằng chứng không thuộc đúng vị trí lưu trữ
  // của người upload (Firebase prefix parcel-ops/...).
  VALIDATION_FAILED:
    "Ảnh bằng chứng không hợp lệ (sai vị trí lưu trữ). Chụp và tải lại ảnh.",
  IDEMPOTENCY_REQUEST_PENDING: "Yêu cầu trước đang được xử lý, đợi một chút.",
  TRIP_NOT_FOUND: "Không tìm thấy chuyến.",
  TRIP_STOP_NOT_FOUND: "Không tìm thấy điểm dừng này trong chuyến.",
  PARCEL_NOT_FOUND: "Không tìm thấy kiện hàng.",
  FORBIDDEN: "Bạn không được phân công cho chuyến này.",
  // Availability engine (API-driver-resource-availability.md §3.5): backend
  // không tính được thời gian di chuyển (Google Routes lỗi/hết quota) — fail
  // closed, thử lại được.
  RESOURCE_TRAVEL_TIME_UNAVAILABLE:
    "Hệ thống chưa tính được lịch di chuyển của xe. Thử lại sau ít phút.",
};

// Conflict tài nguyên khi start chuyến (API-driver-resource-availability.md
// §10.4): TRIP_DRIVER_CONFLICT dùng chung cho cả tài xế lẫn phụ xe — phân biệt
// bằng error.fields.resourceRole. conflictReason=RESOURCE_ACTIVE nghĩa là
// người/xe còn thuộc chuyến ACTIVE chưa hoàn tất; doc yêu cầu không tự retry
// mà phải nhờ điều hành đóng chuyến đang chạy.
function resourceConflictMessage(error: ApiError): string | null {
  if (
    error.code !== "TRIP_DRIVER_CONFLICT" &&
    error.code !== "TRIP_VEHICLE_CONFLICT"
  ) {
    return null;
  }
  const fields = Object.fromEntries(
    (error.fields ?? []).map((item) => [item.field, item.message]),
  );
  const subject =
    error.code === "TRIP_VEHICLE_CONFLICT"
      ? "Xe của chuyến"
      : fields.resourceRole === "ASSISTANT"
        ? "Phụ xe của chuyến"
        : "Bạn";
  if (fields.conflictReason === "RESOURCE_ACTIVE") {
    return `${subject} vẫn đang thuộc một chuyến khác chưa hoàn tất. Liên hệ điều hành đóng chuyến đó trước, đừng bấm lại.`;
  }
  return `${subject} đang vướng lịch một chuyến khác. Liên hệ điều hành kiểm tra lại phân công.`;
}

// Đổi lỗi bất kỳ thành câu hiển thị được. null nghĩa là không có lỗi.
export function tripOpsErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }

  if (error instanceof ApiError) {
    return (
      resourceConflictMessage(error) ??
      MESSAGES[error.code] ??
      apiErrorDisplayMessage(error)
    );
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
