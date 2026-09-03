import { fetch } from "expo/fetch";

import { newIdempotencyKey } from "./idempotency";
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

// App hiển thị 100% tiếng Việt, mà error.message của backend là tiếng Anh →
// KHÔNG hiển thị thô. Chỗ nào có bảng map riêng (trip-ops/shuttle/auth...) thì
// tra bảng trước, không có thì rơi về câu chung kèm mã lỗi ở đây. Các code do
// client tự dựng (mạng, phiên, RAG) đã viết sẵn tiếng Việt nên giữ nguyên.
const VIETNAMESE_MESSAGE_CODES = new Set([
  "NETWORK_ERROR",
  "SESSION_EXPIRED",
  "SERVER_ERROR",
  "RAG_UNAVAILABLE",
  "RAG_STREAM_ERROR",
]);

// Mã hạ tầng/xác thực mọi service đều có thể trả (gateway, idempotency, quyền,
// service tạm chết). Đặt ở đây để mọi bảng map riêng (trip-ops/shuttle/auth/
// route-proposal) tự động có câu tiếng Việt, không phải chép lại từng file.
// Bảng riêng vẫn override được vì chúng tra bảng của mình TRƯỚC khi rơi xuống
// hàm này (vd FORBIDDEN ở shuttle nói rõ "chuyến trung chuyển không thuộc bạn").
const COMMON_MESSAGES: Record<string, string> = {
  // Quyền & phiên.
  UNAUTHORIZED: "Phiên đăng nhập đã hết hạn. Đăng nhập lại giúp nhé.",
  AUTH_TOKEN_INVALID: "Phiên đăng nhập không hợp lệ. Đăng nhập lại giúp nhé.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  ACCESS_DENIED: "Bạn không có quyền xem dữ liệu này.",
  USER_FORBIDDEN: "Tài khoản của bạn không được phép thao tác này.",
  INSUFFICIENT_ROLE: "Tài khoản của bạn không đủ quyền cho thao tác này.",
  USER_INACTIVE: "Tài khoản đang bị tạm ngưng. Liên hệ nhà xe để mở lại.",
  USER_LOCKED: "Tài khoản đã bị khóa. Liên hệ nhà xe để mở lại.",
  USER_NOT_FOUND: "Không tìm thấy tài khoản này.",
  // Dữ liệu gửi lên.
  VALIDATION_ERROR: "Dữ liệu gửi lên không hợp lệ. Kiểm tra lại thông tin.",
  VALIDATION_FAILED: "Dữ liệu gửi lên không hợp lệ. Kiểm tra lại thông tin.",
  RESOURCE_NOT_FOUND: "Không tìm thấy dữ liệu yêu cầu.",
  INVALID_SORT_FIELD: "Không sắp xếp được danh sách theo tiêu chí này.",
  INVALID_FILTER: "Bộ lọc không hợp lệ.",
  // Idempotency: mọi mutation của backend đều bắt Idempotency-Key.
  IDEMPOTENCY_KEY_REQUIRED: "Thiếu khoá chống trùng. Thử lại thao tác giúp em.",
  IDEMPOTENCY_KEY_MISMATCH:
    "Nội dung đã thay đổi so với lần gửi trước. Tải lại rồi gửi lại giúp em.",
  IDEMPOTENCY_KEY_REUSED:
    "Thao tác này đã được gửi trước đó. Tải lại để xem kết quả.",
  IDEMPOTENCY_REQUEST_PENDING: "Yêu cầu trước đang được xử lý, đợi một chút.",
  IDEMPOTENCY_REQUEST_IN_PROGRESS:
    "Yêu cầu trước đang được xử lý, đợi một chút.",
  // Hệ thống / service phụ thuộc tạm gián đoạn — đều là lỗi thử lại được.
  INTERNAL_ERROR: "Hệ thống đang gặp sự cố, thử lại sau ít phút.",
  UPSTREAM_UNAVAILABLE: "Hệ thống đang gián đoạn, thử lại sau ít phút.",
  TRIP_SERVICE_UNAVAILABLE: "Dịch vụ chuyến đang gián đoạn, thử lại sau ít phút.",
  BOOKING_SERVICE_UNAVAILABLE: "Dịch vụ vé đang gián đoạn, thử lại sau ít phút.",
  PARCEL_SERVICE_UNAVAILABLE:
    "Dịch vụ hàng ký gửi đang gián đoạn, thử lại sau ít phút.",
  USER_LOOKUP_UNAVAILABLE:
    "Chưa tra được thông tin tài khoản, thử lại sau ít phút.",
  RATE_LIMITED: "Thao tác quá nhanh. Đợi một lúc rồi thử lại.",
  RATE_LIMIT_EXCEEDED: "Thao tác quá nhanh. Đợi một lúc rồi thử lại.",
  MOBILE_APP_UPDATE_REQUIRED:
    "App đã có bản mới bắt buộc. Cập nhật app rồi dùng tiếp giúp nhé.",
};

export function apiErrorDisplayMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (VIETNAMESE_MESSAGE_CODES.has(error.code)) {
      return error.message;
    }

    const common = COMMON_MESSAGES[error.code];
    if (common) {
      return common;
    }

    // Mã lạ (backend thêm mã mới, chưa kịp map): KHÔNG in mã kỹ thuật lên màn
    // hình cho crew đọc — vừa khó hiểu vừa trông như app lỗi. Mã + traceId đẩy
    // vào console để còn tra được qua logcat/Sentry khi đại ca báo lại.
    console.warn(
      `[api] mã lỗi chưa map: ${error.code} (HTTP ${error.statusCode}, trace ${error.traceId ?? "n/a"})`,
    );
    return "Có lỗi xảy ra. Thử lại hoặc báo điều hành.";
  }
  return "Có lỗi xảy ra, thử lại sau.";
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
    // Refresh token hết hạn/không hợp lệ → xóa phiên. NHƯNG phiên có thể đã
    // đổi trong lúc chờ mạng (logout rồi đăng nhập tài khoản khác): logout
    // revoke refresh token cũ nên nhánh này chắc chắn chạy — không được xoá
    // nhầm token của phiên mới.
    const current = await getTokens();
    if (current?.refreshToken === tokens.refreshToken) {
      await clearTokens();
    }
    return null;
  }

  // Cùng lý do: chỉ ghi kết quả nếu storage vẫn giữ đúng refresh token đã
  // dùng — không thì bỏ, tránh "hồi sinh" token tài khoản cũ đè phiên mới.
  const current = await getTokens();
  if (current?.refreshToken !== tokens.refreshToken) {
    return null;
  }

  await setTokens({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: expiresAtFrom(data.expiresInSeconds),
  });
  return data;
}

// Hạn access token quy về epoch ms. Backend trả `expiresInSeconds`; thiếu/không
// hợp lệ thì trả null = "không biết hạn", client rơi về hành vi cũ (chỉ refresh
// khi gặp 401) thay vì refresh vô nghĩa mỗi request.
export function expiresAtFrom(
  expiresInSeconds: number | null | undefined,
): number | null {
  if (typeof expiresInSeconds !== "number" || !Number.isFinite(expiresInSeconds)) {
    return null;
  }

  return Date.now() + expiresInSeconds * 1000;
}

// Đổi token TRƯỚC khi hết hạn thay vì chờ 401. Lý do không chỉ là tiết kiệm một
// vòng 401: access token mang claim `role` và `operatorId` (docs/Implements/
// API-Driver-Assistant.md §Access token), nên token cũ giữ nguyên phân quyền
// tại thời điểm đăng nhập. Nhân sự được nhà xe giao tuyến/đổi vai sau đó vẫn
// gọi API bằng claim cũ và không thấy chuyến mới cho tới khi logout/login.
//
// 60s biên an toàn: đủ cho một request chậm đi hết vòng mà token chưa lật hạn
// giữa đường.
const TOKEN_REFRESH_SKEW_MS = 60_000;

function isExpiringSoon(expiresAt: number | null): boolean {
  if (expiresAt == null) {
    return false;
  }

  return Date.now() >= expiresAt - TOKEN_REFRESH_SKEW_MS;
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

// Backend chuẩn hoá idempotency toàn hệ thống (guide 2026-07-23,
// docs/Implements/IDEMPOTENCY_CLIENT_MIGRATION_GUIDE.md): mọi mutation
// POST/PUT/PATCH/DELETE "bắt buộc" phải gửi Idempotency-Key là UUID v4, thiếu →
// 422 IDEMPOTENCY_KEY_REQUIRED. Các endpoint "miễn" (login/google/refresh) gửi
// key thừa vẫn vô hại. Tự bù key cho mọi mutation chưa có để phủ hết một chỗ,
// không phải nhớ thêm ở từng call. Retry-cùng-thao-tác dùng lại đúng key
// (yêu cầu mục 12.2 API-driver-resource-availability.md): xem apiRequest —
// mutation rớt mạng giữa chừng được retry một lần với cùng key; mỗi lần bấm
// nút mới vẫn là key mới (đúng doc "mỗi tap action sinh UUID v4").
function hasIdempotencyKey(headers?: Record<string, string>): boolean {
  if (!headers) {
    return false;
  }
  return Object.keys(headers).some(
    (name) => name.toLowerCase() === "idempotency-key",
  );
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const method = (
    options.method ?? (options.body !== undefined ? "POST" : "GET")
  ).toUpperCase();
  const isMutation = method !== "GET" && method !== "HEAD";

  // Sinh key một lần ở đây (không phải trong requestInternal) để retry sau khi
  // refresh 401 dùng lại đúng key — giữ đúng ngữ nghĩa idempotent.
  const finalOptions =
    isMutation && !hasIdempotencyKey(options.headers)
      ? {
          ...options,
          headers: {
            "Idempotency-Key": newIdempotencyKey(),
            // Header do caller truyền vẫn được ưu tiên (ghi đè key mặc định).
            ...options.headers,
          },
        }
      : options;

  try {
    return await requestInternal<T>(path, finalOptions, false);
  } catch (error) {
    // Mutation rớt mạng/timeout giữa chừng: server có thể ĐÃ xử lý xong mà
    // response không về tới nơi. Retry đúng một lần với CÙNG Idempotency-Key
    // (doc availability §12.2): trùng thì nhận lại response đã cache, đang xử
    // lý dở thì 409 IDEMPOTENCY_REQUEST_PENDING — không bao giờ tạo thao tác
    // đúp. GET không retry ở đây (React Query đã tự lo).
    if (
      isMutation &&
      error instanceof ApiError &&
      error.code === "NETWORK_ERROR"
    ) {
      return requestInternal<T>(path, finalOptions, false);
    }
    throw error;
  }
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
    let tokens = await getTokens();

    // Token sắp hết hạn → đổi ngay, đừng gửi đi để nhận 401 rồi mới đổi.
    // `isRetryAfterRefresh` chặn vòng lặp: nhánh 401 bên dưới vừa refresh xong
    // thì lần gọi lại không refresh nữa. refreshTokens() là single-flight nên
    // nhiều query cùng lúc chỉ tạo một request refresh.
    if (tokens && !isRetryAfterRefresh && isExpiringSoon(tokens.expiresAt)) {
      try {
        await refreshTokens();
        tokens = await getTokens();
      } catch {
        // Rớt mạng lúc refresh: cứ gửi token cũ. Còn hạn thì request vẫn chạy,
        // hết hạn thật thì rơi vào nhánh 401 quen thuộc.
      }
    }

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
  try {
    return unwrap(envelope, response.status);
  } catch (error) {
    // Ở dev in nguyên method/path + mã lỗi + `fields` backend chỉ ra field nào
    // sai. Câu tiếng Việt trên màn hình cố tình chung chung nên khi đại ca báo
    // "dữ liệu không hợp lệ" thì đây là chỗ duy nhất truy được nguyên nhân.
    if (__DEV__ && error instanceof ApiError) {
      const fields = error.fields?.length
        ? ` fields=${JSON.stringify(error.fields)}`
        : "";
      console.warn(
        `[api] ${method} ${path} → ${error.statusCode} ${error.code}${fields} trace=${error.traceId ?? "n/a"}`,
      );
    }
    throw error;
  }
}
