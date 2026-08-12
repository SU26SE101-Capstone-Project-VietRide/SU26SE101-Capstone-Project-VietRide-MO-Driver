import { ApiError, apiErrorDisplayMessage } from "@/api/client";

// Thông báo tiếng Việt cho mã lỗi xác thực (login/OTP/đặt mật khẩu). Mã theo
// API-ForgetPassword.md + mục 2.2 API-driver-resource-availability.md. Mã chưa
// map rơi về câu chung kèm mã lỗi — không hiển thị message tiếng Anh thô.
const MESSAGES: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: "Email hoặc mật khẩu không đúng.",
  AUTH_ACCOUNT_LOCKED: "Tài khoản đã bị khóa. Liên hệ nhà xe để mở lại.",
  AUTH_EMAIL_NOT_VERIFIED: "Tài khoản chưa xác thực email.",
  AUTH_PENDING_INITIAL_PASSWORD:
    "Tài khoản chưa đặt mật khẩu lần đầu — mở link kích hoạt trong email nhà xe gửi.",
  AUTH_OTP_INVALID: "Mã OTP không đúng. Kiểm tra lại email rồi nhập lại.",
  AUTH_OTP_EXPIRED: "Mã OTP đã hết hạn. Bấm gửi lại để nhận mã mới.",
  AUTH_OTP_RATE_LIMIT_EXCEEDED:
    "Gửi mã quá nhiều lần. Đợi một lúc rồi thử lại.",
  AUTH_TOKEN_INVALID: "Phiên đăng nhập không hợp lệ. Đăng nhập lại giúp nhé.",
  VALIDATION_ERROR: "Thông tin nhập chưa hợp lệ. Kiểm tra lại rồi thử tiếp.",
  FORBIDDEN: "Tài khoản không có quyền dùng app này.",
  RATE_LIMITED: "Thao tác quá nhanh. Đợi một lúc rồi thử lại.",
  UPSTREAM_UNAVAILABLE: "Hệ thống đang gián đoạn, thử lại sau ít phút.",
  INTERNAL_ERROR: "Hệ thống đang gặp sự cố, thử lại sau ít phút.",
};

// Đổi lỗi bất kỳ của luồng auth thành câu tiếng Việt hiển thị được.
export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return MESSAGES[error.code] ?? apiErrorDisplayMessage(error);
  }
  return "Có lỗi xảy ra, thử lại sau.";
}
