import { ApiError, apiErrorDisplayMessage } from "@/api/client";

// Thông báo tiếng Việt cho mã lỗi của API đề xuất đổi tuyến. Mã không có trong
// bảng thì rơi về câu chung kèm mã lỗi, giống nếp trip-ops-errors.ts.
const MESSAGES: Record<string, string> = {
  TRIP_NOT_EDITABLE: "Chuyến không còn ở trạng thái cho phép đổi tuyến.",
  TRIP_NOT_FOUND: "Không tìm thấy chuyến.",
  ROUTE_NOT_FOUND: "Tuyến thay thế này vừa bị gỡ hoặc ngừng sử dụng.",
  INCIDENT_NOT_FOUND: "Sự cố đính kèm không thuộc chuyến này.",
  STATION_NOT_FOUND: "Bến đến của tuyến này không còn hợp lệ.",
  STOP_NOT_FOUND: "Có điểm dừng của tuyến này không còn hợp lệ.",
  FORBIDDEN: "Bạn không được phân công cho chuyến này.",
  IDEMPOTENCY_REQUEST_PENDING:
    "Yêu cầu trước đang được xử lý, đợi một chút rồi thử lại.",
  IDEMPOTENCY_KEY_REQUIRED: "Thiếu khoá chống trùng, thử gửi lại giúp em.",
  IDEMPOTENCY_KEY_MISMATCH:
    "Nội dung đề xuất đã thay đổi so với lần gửi trước, gửi lại giúp em.",
  UPSTREAM_UNAVAILABLE: "Máy chủ đang bận, thử lại sau ít phút.",
  // Các mã geometry chỉ phát sinh với đề xuất tuyến tự vẽ (chưa làm), nhưng vẫn
  // map sẵn để không lọt chuỗi tiếng Anh nếu backend đổi hành vi.
  ROUTE_GEOMETRY_TOO_LARGE: "Dữ liệu đường đi quá lớn.",
  ROUTE_GEOMETRY_INVALID: "Dữ liệu đường đi không hợp lệ.",
  ROUTE_GEOMETRY_STOP_MISMATCH:
    "Có điểm dừng nằm quá xa đường đi của tuyến này.",
};

export function routeProposalErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }

  if (error instanceof ApiError) {
    // Field message của backend (FluentValidation) là tiếng Anh → dùng câu
    // chung tiếng Việt, không hiển thị thô.
    if (error.code === "VALIDATION_ERROR") {
      return "Dữ liệu gửi lên không hợp lệ. Kiểm tra lại thông tin đề xuất.";
    }
    return MESSAGES[error.code] ?? apiErrorDisplayMessage(error);
  }

  return "Có lỗi xảy ra, thử lại sau.";
}

// Các lỗi này nghĩa là chưa chắc server đã nhận được đề xuất → phải giữ nguyên
// Idempotency-Key khi thử lại, tránh tạo đề xuất trùng.
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }
  return (
    error.code === "NETWORK_ERROR" ||
    error.code === "UPSTREAM_UNAVAILABLE" ||
    error.code === "INTERNAL_ERROR" ||
    error.code === "SERVER_ERROR"
  );
}
