import { ApiError } from "@/api/client";

// Thông báo tiếng Việt cho mã lỗi shuttle (API-Driver-Assistant.md). Mã không
// có ở đây thì dùng message của backend.
const MESSAGES: Record<string, string> = {
  FORBIDDEN: "Chuyến trung chuyển này không thuộc về bạn.",
  SHUTTLE_TRIP_NOT_FOUND: "Không tìm thấy chuyến trung chuyển.",
  SHUTTLE_STATION_NOT_FOUND: "Không tìm thấy thông tin bến của chuyến.",
  INVALID_STATUS:
    "Trạng thái chuyến đã thay đổi. Danh sách vừa được tải lại, kiểm tra rồi thao tác tiếp.",
  SHUTTLE_PASSENGERS_PENDING:
    "Vẫn còn khách chưa xử lý. Xác nhận đón/vắng mặt hết các điểm trước khi hoàn tất.",
  SHUTTLE_MANIFEST_INCONSISTENT_STATUS:
    "Dữ liệu điểm đón không đồng nhất. Liên hệ điều hành để xử lý.",
  IDEMPOTENCY_KEY_REQUIRED: "Thiếu khóa idempotency. Thử lại thao tác.",
  IDEMPOTENCY_REQUEST_PENDING: "Yêu cầu trước đang được xử lý, đợi một chút.",
};

// Đổi lỗi bất kỳ thành câu hiển thị được. null nghĩa là không có lỗi.
export function shuttleErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }

  if (error instanceof ApiError) {
    return MESSAGES[error.code] ?? error.message;
  }

  return "Có lỗi xảy ra, thử lại sau.";
}
