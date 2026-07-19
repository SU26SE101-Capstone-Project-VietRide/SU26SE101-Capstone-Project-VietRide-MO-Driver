import { apiRequest, refreshTokens } from "./client";
import { clearTokens, getTokens, setTokens } from "./token-storage";
import type {
  AuthUser,
  DevicePlatform,
  DeviceTokenData,
  ForgotPasswordData,
  LoginData,
  ResetPasswordData,
  SetInitialPasswordData,
} from "./types";

export async function login(
  email: string,
  password: string,
): Promise<LoginData> {
  const data = await apiRequest<LoginData>("/v1/auth/login", {
    method: "POST",
    body: { email: email.trim(), password },
    auth: false,
  });

  await setTokens({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  });

  return data;
}

// Kích hoạt tài khoản crew: đặt mật khẩu lần đầu bằng token từ email mời.
export function setInitialPassword(
  token: string,
  password: string,
): Promise<SetInitialPasswordData> {
  return apiRequest<SetInitialPasswordData>("/v1/auth/set-initial-password", {
    method: "POST",
    body: { token, password },
    auth: false,
  });
}

// Yêu cầu OTP đặt lại mật khẩu. Endpoint public — luôn trả 200 cho email hợp lệ
// (kể cả email không tồn tại) để tránh account enumeration; chỉ 429 khi vượt rate limit.
export function forgotPassword(email: string): Promise<ForgotPasswordData> {
  return apiRequest<ForgotPasswordData>("/v1/auth/forgot-password", {
    method: "POST",
    body: { email: email.trim() },
    auth: false,
  });
}

// Đặt lại mật khẩu bằng OTP. Backend revoke toàn bộ refresh token của user sau khi
// thành công → xóa token local để buộc đăng nhập lại bằng mật khẩu mới.
export async function resetPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<ResetPasswordData> {
  const data = await apiRequest<ResetPasswordData>("/v1/auth/reset-password", {
    method: "POST",
    body: { email: email.trim(), code: code.trim(), newPassword },
    auth: false,
  });

  await clearTokens();
  return data;
}

// Khôi phục phiên lúc mở app: có refresh token thì đổi lấy access token mới.
// Trả null nếu chưa từng đăng nhập hoặc refresh token hết hạn.
export async function bootstrapSession(): Promise<AuthUser | null> {
  const tokens = await getTokens();

  if (!tokens) {
    return null;
  }

  const refreshed = await refreshTokens();
  return refreshed?.user ?? null;
}

export async function logout(): Promise<void> {
  const tokens = await getTokens();

  if (tokens) {
    try {
      await apiRequest<unknown>("/v1/auth/logout", {
        method: "POST",
        body: { refreshToken: tokens.refreshToken },
      });
    } catch {
      // Best-effort: mất mạng vẫn đăng xuất local được.
    }
  }

  await clearTokens();
}

export function getMe(): Promise<AuthUser> {
  return apiRequest<AuthUser>("/v1/users/me");
}

// Đăng ký/refresh FCM device token để nhận push. Không cần Idempotency-Key.
export function registerDeviceToken(
  fcmToken: string,
  platform: DevicePlatform,
): Promise<DeviceTokenData> {
  return apiRequest<DeviceTokenData>("/v1/auth/device-token", {
    method: "POST",
    body: { fcmToken, platform },
  });
}

// Gỡ device token (khi logout). Backend trả 204.
export async function removeDeviceToken(fcmToken: string): Promise<void> {
  await apiRequest<void>("/v1/auth/device-token", {
    method: "DELETE",
    body: { fcmToken },
  });
}
