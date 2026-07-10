import { apiRequest, refreshTokens } from "./client";
import { clearTokens, getTokens, setTokens } from "./token-storage";
import type { AuthUser, LoginData, SetInitialPasswordData } from "./types";

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
