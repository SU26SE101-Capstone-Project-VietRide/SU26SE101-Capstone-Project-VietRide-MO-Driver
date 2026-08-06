import { apiRequest } from "./client";
import type {
  AlternativeRoutesData,
  CreateRouteChangeProposalInput,
  RouteChangeProposal,
  RouteChangeProposalsData,
} from "./types";

// Đề xuất đổi tuyến của tài xế/phụ xe. Cả DRIVER lẫn ASSISTANT dùng chung
// prefix /v1/driver; backend đối chiếu JWT sub với driverUserId/assistantUserId
// của Trip để phân quyền.

// Backend mặc định page=1, pageSize=20 và chặn pageSize > 100. App không dựng
// UI phân trang nên gửi thẳng mặc định.
const DEFAULT_PAGE_SIZE = 20;

// Tuyến thay thế active của Route chính, để chọn khi tạo đề xuất EXISTING.
export function getAlternativeRoutes(
  tripId: string,
): Promise<AlternativeRoutesData> {
  const query = new URLSearchParams({
    page: "1",
    pageSize: String(DEFAULT_PAGE_SIZE),
  });
  return apiRequest<AlternativeRoutesData>(
    `/v1/driver/trips/${tripId}/alternative-routes?${query}`,
  );
}

// Toàn bộ đề xuất của chuyến, mọi trạng thái, sắp createdAt giảm dần.
export function getTripRouteChangeProposals(
  tripId: string,
): Promise<RouteChangeProposalsData> {
  const query = new URLSearchParams({
    page: "1",
    pageSize: String(DEFAULT_PAGE_SIZE),
  });
  return apiRequest<RouteChangeProposalsData>(
    `/v1/driver/trips/${tripId}/route-change-proposals?${query}`,
  );
}

// Idempotency-Key do caller truyền vào chứ không để apiRequest tự sinh: API này
// cho phép nhiều đề xuất PENDING cùng lúc (doc mục 9.3), nên retry bằng key mới
// sẽ tạo đề xuất trùng. Hook giữ nguyên key qua các lần thử lại.
export function createRouteChangeProposal(
  tripId: string,
  input: CreateRouteChangeProposalInput,
  idempotencyKey: string,
): Promise<RouteChangeProposal> {
  return apiRequest<RouteChangeProposal>(
    `/v1/driver/trips/${tripId}/route-change-proposals`,
    {
      method: "POST",
      body: input,
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
}
