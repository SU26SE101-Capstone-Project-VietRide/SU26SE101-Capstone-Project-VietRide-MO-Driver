import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Lưu cặp token đăng nhập. Native dùng SecureStore (Keychain/Keystore);
// web fallback localStorage vì expo-secure-store không hỗ trợ web.

const ACCESS_TOKEN_KEY = "vietride.accessToken";
const REFRESH_TOKEN_KEY = "vietride.refreshToken";
const EXPIRES_AT_KEY = "vietride.accessTokenExpiresAt";

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  // Epoch ms hết hạn của access token, tính từ `expiresInSeconds` của backend.
  // `null` khi phiên được lưu bởi bản app cũ (chưa ghi khoá này) — caller phải
  // coi đó là "không biết hạn" chứ không phải "đã hết hạn".
  expiresAt: number | null;
};

const isWeb = Platform.OS === "web";

async function getItem(key: string): Promise<string | null> {
  if (isWeb) {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function getTokens(): Promise<StoredTokens | null> {
  const [accessToken, refreshToken, expiresAt] = await Promise.all([
    getItem(ACCESS_TOKEN_KEY),
    getItem(REFRESH_TOKEN_KEY),
    getItem(EXPIRES_AT_KEY),
  ]);

  if (!accessToken || !refreshToken) {
    return null;
  }

  // Chuỗi rác trong store (bản cũ, ghi dở) không được biến thành NaN rồi làm
  // mọi so sánh hạn token thành false một cách âm thầm.
  const parsed = expiresAt ? Number(expiresAt) : Number.NaN;

  return {
    accessToken,
    refreshToken,
    expiresAt: Number.isFinite(parsed) ? parsed : null,
  };
}

export async function setTokens(tokens: StoredTokens): Promise<void> {
  await Promise.all([
    setItem(ACCESS_TOKEN_KEY, tokens.accessToken),
    setItem(REFRESH_TOKEN_KEY, tokens.refreshToken),
    tokens.expiresAt == null
      ? deleteItem(EXPIRES_AT_KEY)
      : setItem(EXPIRES_AT_KEY, String(tokens.expiresAt)),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    deleteItem(ACCESS_TOKEN_KEY),
    deleteItem(REFRESH_TOKEN_KEY),
    deleteItem(EXPIRES_AT_KEY),
  ]);
}
