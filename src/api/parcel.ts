import { apiRequest } from "./client";
import { newIdempotencyKey } from "./idempotency";
import type {
  AssistantParcelListData,
  CheckInParcelData,
  ConfirmParcelDeliveryData,
  DeliverParcelData,
  LoadParcelData,
  ParcelDetail,
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

export type CheckInParcelInput = {
  tripId: string;
  parcelCode: string;
};

// Assistant xác nhận sender mang đúng kiện tới bến (Settlement v2).
// Chỉ nhận kiện RESERVED, đúng trip/code và trước latestCheckInAt.
// RESERVED -> CHECKED_IN. Quá hạn chưa check-in → backend tự REJECTED, mất cọc.
export function checkInParcel(
  parcelId: string,
  input: CheckInParcelInput,
): Promise<CheckInParcelData> {
  return apiRequest<CheckInParcelData>(
    `/v1/assistant/parcels/${parcelId}/check-in`,
    {
      method: "POST",
      body: input,
      headers: { "Idempotency-Key": newIdempotencyKey() },
    },
  );
}

// Settlement v2: chỉ gửi 4 số đo; backend tự tính DIM/chargeable weight, suy
// size và giá cuối. KHÔNG gửi actualSizeCategory hay paymentMethod nữa.
export type ReweighParcelInput = {
  actualLengthCm: number;
  actualWidthCm: number;
  actualHeightCm: number;
  actualWeightKg: number;
};

// Assistant cân lại kiện CHECKED_IN (phải trước loadCutoffAt). Kết quả:
// còn balance → PENDING_FINAL_PAYMENT (khách trả nốt qua app khách);
// đủ tiền/thừa cọc → READY_TO_LOAD (thừa thì backend tự hoàn, không chặn load);
// vượt tải → PENDING_OPERATOR_ACTION. Bắt buộc Idempotency-Key.
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

export type LoadParcelInput = {
  tripId: string;
  parcelCode: string;
};

// Assistant scan xếp kiện lên xe. Chỉ nhận kiện READY_TO_LOAD.
// READY_TO_LOAD -> LOADED; Trip cargo ledger chuyển reservation thành loaded.
export function loadParcel(
  parcelId: string,
  input: LoadParcelInput,
): Promise<LoadParcelData> {
  return apiRequest<LoadParcelData>(`/v1/assistant/parcels/${parcelId}/load`, {
    method: "POST",
    body: input,
    headers: { "Idempotency-Key": newIdempotencyKey() },
  });
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

// Assistant dỡ kiện khỏi xe (không body). IN_TRANSIT -> UNLOADED.
// Chỉ nhả cargo, KHÔNG sinh delivery token và KHÔNG phải bước giao hàng.
// Backend chặn nếu xe chưa tới đúng mốc: 422 DROP_OFF_STOP_NOT_ARRIVED (kiện gắn
// stop) hoặc 422 DESTINATION_TERMINAL_NOT_ARRIVED (kiện trả tại bến cuối).
export function unloadParcel(parcelId: string): Promise<UnloadParcelData> {
  return apiRequest<UnloadParcelData>(
    `/v1/assistant/parcels/${parcelId}/unload`,
    {
      method: "POST",
      headers: { "Idempotency-Key": newIdempotencyKey() },
    },
  );
}

// Assistant giao kiện cho người nhận (không body).
// UNLOADED -> DELIVERED_PENDING_CONFIRM, sinh delivery token TTL 48 giờ.
// Đây là bước bắt buộc giữa unload và confirm-delivery.
export function deliverParcel(parcelId: string): Promise<DeliverParcelData> {
  return apiRequest<DeliverParcelData>(
    `/v1/assistant/parcels/${parcelId}/deliver`,
    {
      method: "POST",
      headers: { "Idempotency-Key": newIdempotencyKey() },
    },
  );
}
