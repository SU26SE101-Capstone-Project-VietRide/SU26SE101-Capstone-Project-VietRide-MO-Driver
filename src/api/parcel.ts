import { apiRequest } from "./client";
import { newIdempotencyKey } from "./idempotency";
import type {
  AssistantParcelListData,
  ConfirmParcelDeliveryData,
  ParcelDetail,
  ParcelPaymentMethod,
  ReweighParcelData,
  UnloadParcelData,
} from "./types";

// Chi tiết 1 kiện. Mọi role có token đều gọi được; backend kiểm quyền theo
// userId/operatorId. Assistant có thể lấy parcelId qua QR rồi gọi hàm này.
export function getParcel(parcelId: string): Promise<ParcelDetail> {
  return apiRequest<ParcelDetail>(`/v1/parcels/${parcelId}`);
}

// Danh sách kiện của chuyến mà Assistant được phân công (read-only, không cần
// Idempotency-Key). Nguồn parcelId cho các thao tác reweigh/unload/confirm.
export function getAssistantTripParcels(
  tripId: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<AssistantParcelListData> {
  const query = new URLSearchParams();
  if (params.page != null) query.set("page", String(params.page));
  if (params.pageSize != null) query.set("pageSize", String(params.pageSize));

  const queryString = query.toString();
  const suffix = queryString ? `?${queryString}` : "";
  return apiRequest<AssistantParcelListData>(
    `/v1/assistant/trips/${tripId}/parcels${suffix}`,
  );
}

export type ReweighParcelInput = {
  actualLengthCm: number;
  actualWidthCm: number;
  actualHeightCm: number;
  actualWeightKg: number;
  actualSizeCategory: string;
  paymentMethod: ParcelPaymentMethod;
};

// Assistant cân lại kiện. Backend tính lại chargeable weight (DIM), có thể ra
// PENDING_ADDITIONAL_PAYMENT (phụ thu) / PENDING_OPERATOR_ACTION (vượt tải hoặc
// cần xác nhận hoàn tiền). Bắt buộc Idempotency-Key.
export function reweighParcel(
  parcelId: string,
  input: ReweighParcelInput,
): Promise<ReweighParcelData> {
  return apiRequest<ReweighParcelData>(
    `/v1/assistant/parcels/${parcelId}/reweigh`,
    {
      method: "POST",
      body: input,
      headers: { "Idempotency-Key": newIdempotencyKey() },
    },
  );
}

// Assistant xác nhận giao hàng thủ công (note bắt buộc, max 500 ký tự theo doc).
export function confirmParcelDelivery(
  parcelId: string,
  note: string,
): Promise<ConfirmParcelDeliveryData> {
  return apiRequest<ConfirmParcelDeliveryData>(
    `/v1/assistant/parcels/${parcelId}/confirm-delivery`,
    {
      method: "POST",
      body: { note },
      headers: { "Idempotency-Key": newIdempotencyKey() },
    },
  );
}

// Assistant unload kiện tại điểm trả (không body). Kiện chuyển sang
// DELIVERED_PENDING_CONFIRM. Bắt buộc Idempotency-Key.
export function unloadParcel(parcelId: string): Promise<UnloadParcelData> {
  return apiRequest<UnloadParcelData>(
    `/v1/assistant/parcels/${parcelId}/unload`,
    {
      method: "POST",
      headers: { "Idempotency-Key": newIdempotencyKey() },
    },
  );
}
