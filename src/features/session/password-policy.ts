// Policy mật khẩu của backend (FE-RESPONSE-LOCKDRIVER-PASSWORD.md §6.2, áp
// chung cho change/forgot/reset): 8..128 ký tự, ít nhất 1 chữ + 1 số, ký tự
// đặc biệt không bắt buộc. KHÔNG trim/biến đổi password trước khi gửi.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

// Trả về thông báo lỗi đầu tiên, hoặc null nếu mật khẩu hợp lệ.
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Mật khẩu tối đa ${MAX_PASSWORD_LENGTH} ký tự.`;
  }
  if (!/[a-zA-Z]/.test(password)) {
    return "Mật khẩu phải có ít nhất 1 chữ cái.";
  }
  if (!/\d/.test(password)) {
    return "Mật khẩu phải có ít nhất 1 chữ số.";
  }
  return null;
}
