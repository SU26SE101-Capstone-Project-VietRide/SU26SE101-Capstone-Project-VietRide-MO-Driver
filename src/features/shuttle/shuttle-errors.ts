import { ApiError, apiErrorDisplayMessage } from "@/api/client";

// Thông báo tiếng Việt cho mã lỗi shuttle (API-Driver-Assistant.md +
// API-driver-resource-availability.md §10.5). Mã không có ở đây thì dùng
// message của backend.
const MESSAGES: Record<string, string> = {
  FORBIDDEN: "Chuyến trung chuyển này không thuộc về bạn.",
  SHUTTLE_TRIP_NOT_FOUND: "Không tìm thấy chuyến trung chuyển.",
  SHUTTLE_STATION_NOT_FOUND: "Không tìm thấy thông tin bến của chuyến.",
  INVALID_STATUS:
    "Trạng thái chuyến đã thay đổi. Danh sách vừa được tải lại, kiểm tra rồi thao tác tiếp.",
  SHUTTLE_TRIP_INVALID_STATE:
    "Trạng thái chuyến đã thay đổi. Danh sách vừa được tải lại, kiểm tra rồi thao tác tiếp.",
  SHUTTLE_TRIP_TERMINAL: "Chuyến trung chuyển đã kết thúc rồi.",
  SHUTTLE_PICKUP_NOT_FOUND: "Không tìm thấy điểm đón này trong chuyến.",
  SHUTTLE_PICKUP_NOT_PENDING: "Điểm đón này đã được xử lý trước đó.",
  SHUTTLE_PASSENGER_NOT_FOUND: "Không tìm thấy nhóm khách của điểm đón này.",
  SHUTTLE_PASSENGER_INVALID_STATE:
    "Nhóm khách này không ở trạng thái cho phép thao tác. Danh sách vừa được tải lại.",
  SHUTTLE_PASSENGERS_PENDING:
    "Vẫn còn khách chưa xử lý. Xác nhận đón/vắng mặt hết các điểm trước khi hoàn tất.",
  // Tên mã trong API-driver-resource-availability.md; giữ cả bản cũ
  // SHUTTLE_PASSENGERS_PENDING ở trên phòng backend còn trả tên cũ.
  SHUTTLE_PASSENGERS_INCOMPLETE:
    "Vẫn còn khách chưa xử lý. Xác nhận đón/vắng mặt hết các điểm trước khi hoàn tất.",
  SHUTTLE_MANIFEST_INCONSISTENT_STATUS:
    "Dữ liệu điểm đón không đồng nhất. Liên hệ điều hành để xử lý.",
  // Conflict tài nguyên khi start shuttle (§6.2): bạn hoặc xe còn thuộc
  // chuyến khác chưa hoàn tất/trùng lịch — điều hành xử lý, không tự retry.
  SHUTTLE_DRIVER_CONFLICT:
    "Bạn vẫn đang thuộc một chuyến khác chưa hoàn tất hoặc trùng lịch. Liên hệ điều hành, đừng bấm lại.",
  SHUTTLE_VEHICLE_CONFLICT:
    "Xe vẫn đang thuộc một chuyến khác chưa hoàn tất hoặc trùng lịch. Liên hệ điều hành, đừng bấm lại.",
  RESOURCE_TRAVEL_TIME_UNAVAILABLE:
    "Hệ thống chưa tính được lịch di chuyển của xe. Thử lại sau ít phút.",
  IDEMPOTENCY_KEY_REQUIRED: "Thiếu khóa idempotency. Thử lại thao tác.",
  IDEMPOTENCY_REQUEST_PENDING: "Yêu cầu trước đang được xử lý, đợi một chút.",
};

// Đổi lỗi bất kỳ thành câu hiển thị được. null nghĩa là không có lỗi.
export function shuttleErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }

  if (error instanceof ApiError) {
    // Mã chưa map → câu chung tiếng Việt kèm mã, không lộ message tiếng Anh.
    return MESSAGES[error.code] ?? apiErrorDisplayMessage(error);
  }

  return "Có lỗi xảy ra, thử lại sau.";
}
