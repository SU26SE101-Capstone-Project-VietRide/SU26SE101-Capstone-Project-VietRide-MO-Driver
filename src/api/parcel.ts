import { apiRequest } from "./client";
import { newIdempotencyKey } from "./idempotency";
import type {
  AssistantParcelListData,
  CheckInParcelData,
  ConfirmParcelTransferData,
  DeliverParcelData,
  LoadParcelData,
  ManualConfirmParcelData,
  ParcelDetail,
  ResendDeliveryEmailData,
  ReweighParcelData,
  ScanParcelQrData,
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
  // Ảnh bằng chứng nhận kiện (URL đã upload). Optional — luồng upload cho crew
  // chưa được BE chốt Storage Rules, xem docs/Implements/API-Parcel-QR-Crew.md.
  photoUrls?: string[];
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

// Crew (driver + assistant) xác nhận giao thay người nhận khi khách không tự
// confirm qua email. BE xác nhận 2026-08-08: đây là route chính cho app mobile;
// /v1/assistant/.../confirm-delivery chỉ là alias cùng command. Kiện phải đang
// DELIVERED_PENDING_CONFIRM (sai → 400 PARCEL_NOT_PENDING_CONFIRM); sau khi
// confirm, token của khách bị revoke, status -> DELIVERY_CONFIRMED.
export function confirmParcelDelivery(
  parcelId: string,
  note: string,
): Promise<ManualConfirmParcelData> {
  return apiRequest<ManualConfirmParcelData>(
    `/v1/crew/parcels/${parcelId}/manual-confirm`,
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

// Assistant giao kiện cho người nhận.
// UNLOADED -> DELIVERED_PENDING_CONFIRM, sinh delivery token TTL 48 giờ.
// Đây là bước bắt buộc giữa unload và confirm-delivery. photoUrls là ảnh bằng
// chứng giao (optional — luồng upload cho crew chưa chốt, xem API-Parcel-QR-Crew.md).
export function deliverParcel(
  parcelId: string,
  photoUrls?: string[],
): Promise<DeliverParcelData> {
  return apiRequest<DeliverParcelData>(
    `/v1/assistant/parcels/${parcelId}/deliver`,
    {
      method: "POST",
      ...(photoUrls && photoUrls.length > 0 ? { body: { photoUrls } } : {}),
      headers: { "Idempotency-Key": newIdempotencyKey() },
    },
  );
}

// ===== QR kiện + crew endpoints (docs/Implements/API-Parcel-QR-Crew.md) =====

// Quét QR kiện: tra cứu kiện theo mã trong chuyến của assistant. Chỉ đọc,
// không đổi trạng thái (dù là POST).
export function scanParcelQr(
  tripId: string,
  parcelCode: string,
): Promise<ScanParcelQrData> {
  return apiRequest<ScanParcelQrData>(
    `/v1/assistant/trips/${tripId}/parcels/qr-scan`,
    {
      method: "POST",
      body: { parcelCode },
    },
  );
}

// Crew chuyến ĐÍCH xác nhận đã nhận kiện được operator chuyển sang
// (PENDING_TRANSFER_CONFIRM). parcelCode để đối chiếu đúng kiện cầm trên tay.
export function confirmParcelTransfer(
  parcelId: string,
  parcelCode: string,
): Promise<ConfirmParcelTransferData> {
  return apiRequest<ConfirmParcelTransferData>(
    `/v1/crew/parcels/${parcelId}/confirm-transfer`,
    {
      method: "POST",
      body: { parcelCode },
      headers: { "Idempotency-Key": newIdempotencyKey() },
    },
  );
}

// Gửi lại email xác nhận giao cho người nhận (kiện DELIVERED_PENDING_CONFIRM).
// expiresAt trong response là hạn mới của delivery token.
export function resendDeliveryEmail(
  parcelId: string,
): Promise<ResendDeliveryEmailData> {
  return apiRequest<ResendDeliveryEmailData>(
    `/v1/crew/parcels/${parcelId}/resend-delivery-email`,
    {
      method: "POST",
      headers: { "Idempotency-Key": newIdempotencyKey() },
    },
  );
}
