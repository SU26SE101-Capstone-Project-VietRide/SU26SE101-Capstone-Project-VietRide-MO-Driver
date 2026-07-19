import { fetch } from "expo/fetch";

import { clearTokens, getTokens, setTokens } from "./token-storage";
import type { ApiErrorField, Envelope, LoginData } from "./types";

// Edge gateway của backend. Cho phép override qua env khi trỏ staging/local.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "https://api.vietride.online";

const NETWORK_ERROR_MESSAGE =
  "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";

export class ApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly fields?: ApiErrorField[];
  readonly traceId?: string;

  constructor(params: {
    code: string;
    message: string;
    statusCode: number;
    fields?: ApiErrorField[];
    traceId?: string;
  }) {
    super(params.message);
    this.name = "ApiError";
    this.code = params.code;
    this.statusCode = params.statusCode;
    this.fields = params.fields;
    this.traceId = params.traceId;
  }
}

// SessionProvider đăng ký handler này để bị đá về màn login khi refresh fail.
let onSessionExpired: (() => void) | null = null;

export function setOnSessionExpired(handler: (() => void) | null) {
  onSessionExpired = handler;
}

function networkError(): ApiError {
  return new ApiError({
    code: "NETWORK_ERROR",
    message: NETWORK_ERROR_MESSAGE,
    statusCode: 0,
  });
}

async function parseEnvelope<T>(response: Response): Promise<Envelope<T>> {
  try {
    return (await response.json()) as Envelope<T>;
  } catch {
    // Edge trả non-JSON (HTML lỗi 5xx…) → quy về lỗi máy chủ chung.
    throw new ApiError({
      code: "SERVER_ERROR",
      message: "Máy chủ trả về dữ liệu không hợp lệ.",
      statusCode: response.status,
    });
  }
}

function unwrap<T>(envelope: Envelope<T>, statusCode: number): T {
  if (envelope.success && envelope.data !== undefined) {
    return envelope.data;
  }

  throw new ApiError({
    code: envelope.error?.code ?? "UNKNOWN_ERROR",
    message: envelope.error?.message ?? "Có lỗi xảy ra, thử lại sau.",
    statusCode: envelope.statusCode ?? statusCode,
    fields: envelope.error?.fields,
    traceId: envelope.meta?.traceId,
  });
}

// Single-flight refresh: nhiều request 401 cùng lúc chỉ gọi refresh 1 lần.
let refreshPromise: Promise<LoginData | null> | null = null;

export function refreshTokens(): Promise<LoginData | null> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function doRefresh(): Promise<LoginData | null> {
  const tokens = await getTokens();

  if (!tokens) {
    return null;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
  } catch {
    // Lỗi mạng lúc refresh: giữ nguyên token để thử lại lần sau.
    throw networkError();
  }

  let data: LoginData;
  try {
    const envelope = await parseEnvelope<LoginData>(response);
    data = unwrap(envelope, response.status);
  } catch {
    // Refresh token hết hạn/không hợp lệ → xóa phiên.
    await clearTokens();
    return null;
  }

  await setTokens({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  });
  return data;
}

export type ApiRequestOptions = {
  method?: string;
  body?: unknown;
  // false cho endpoint public (login…). Mặc định true: gắn Bearer token.
  auth?: boolean;
  // Header tùy biến (vd Idempotency-Key cho mutation của Parcel).
  // Ghi đè các header mặc định nếu trùng tên.
  headers?: Record<string, string>;
};

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  return requestInternal<T>(path, options, false);
}

async function requestInternal<T>(
  path: string,
  options: ApiRequestOptions,
  isRetryAfterRefresh: boolean,
): Promise<T> {
  const {
    auth = true,
    body,
    method = body !== undefined ? "POST" : "GET",
    headers: customHeaders,
  } = options;

  const headers: Record<string, string> = { Accept: "application/json" };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const tokens = await getTokens();
    if (tokens) {
      headers.Authorization = `Bearer ${tokens.accessToken}`;
    }
  }

  // Header tùy biến ghi đè sau cùng (vd Idempotency-Key).
  if (customHeaders) {
    Object.assign(headers, customHeaders);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw networkError();
  }

  // 401 giữa phiên → thử refresh đúng 1 lần rồi gọi lại.
  if (response.status === 401 && auth && !isRetryAfterRefresh) {
    const refreshed = await refreshTokens();

    if (!refreshed) {
      onSessionExpired?.();
      throw new ApiError({
        code: "SESSION_EXPIRED",
        message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
        statusCode: 401,
      });
    }

    return requestInternal<T>(path, options, true);
  }

  // 204 No Content: body rỗng, không có envelope để parse (vd mark-read).
  // ApiResponseInterceptor của backend bỏ qua envelope cho status 204.
  if (response.status === 204) {
    return undefined as T;
  }

  const envelope = await parseEnvelope<T>(response);
  return unwrap(envelope, response.status);
}
