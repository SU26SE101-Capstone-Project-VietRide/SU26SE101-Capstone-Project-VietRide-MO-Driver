import { apiRequest } from "./client";
import type {
  AssistantParcelActionData,
  AssistantParcelItem,
  AssistantParcelManifestData,
  ConfirmParcelTransferData,
  CustodyExceptionApproval,
  CustodyExceptionApprovalStatus,
  ManualConfirmParcelData,
  ParcelDetail,
  ResendDeliveryEmailData,
  ReweighParcelData,
  StopReconcileData,
} from "./types";

// Chi tiết 1 kiện. Mọi role có token đều gọi được; backend kiểm quyền theo
// userId/operatorId. Assistant có thể lấy parcelId qua QR rồi gọi hàm này.
export function getParcel(parcelId: string): Promise<ParcelDetail> {
  return apiRequest<ParcelDetail>(`/v1/parcels/${parcelId}`);
}

// ===== Chuẩn hoá contract cũ ↔ mới =====================================
// docs/Implements/API-Parcel-Driver.md §1: production còn trả PagedResult cũ
// cho manifest và response phẳng {parcelId,parcelCode,status} cho mutation,
// trong khi source/local đã đổi sang manifest screen-ready + action response.
// Toàn bộ app phía trên chỉ làm việc với shape MỚI; hai hàm dưới đây dựng bản
// tương thích khi backend còn cũ, nên không phải rải feature-flag khắp UI.

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RawRecord)
    : null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// Manifest có `tripContext` hoặc item có `availableActions` ⇒ backend đã bật
// contract mới (§11: không tự suy thao tác từ status khi backend đã trả).
export function manifestHasCustodyContract(
  manifest: AssistantParcelManifestData | undefined | null,
): boolean {
  if (!manifest) {
    return false;
  }
  return (
    manifest.tripContext != null ||
    manifest.items.some((item) => Array.isArray(item.availableActions))
  );
}

function normalizeManifest(raw: unknown): AssistantParcelManifestData {
  const record = asRecord(raw) ?? {};
  const items = Array.isArray(record.items)
    ? (record.items as AssistantParcelItem[])
    : [];
  const pagination = asRecord(record.pagination);

  return {
    tripContext:
      (asRecord(
        record.tripContext,
      ) as AssistantParcelManifestData["tripContext"]) ?? null,
    summary:
      (asRecord(record.summary) as AssistantParcelManifestData["summary"]) ??
      null,
    items,
    pagination: {
      // Contract cũ để các field phân trang phẳng ngay trên data.
      page: asNumber(pagination?.page ?? record.page, 1),
      pageSize: asNumber(pagination?.pageSize ?? record.pageSize, items.length),
      totalItems: asNumber(
        pagination?.totalItems ?? record.totalItems,
        items.length,
      ),
      totalPages: asNumber(pagination?.totalPages ?? record.totalPages, 1),
      hasNextPage: Boolean(pagination?.hasNextPage ?? record.hasNextPage),
      hasPreviousPage: Boolean(
        pagination?.hasPreviousPage ?? record.hasPreviousPage,
      ),
    },
  };
}

// Mutation response: mới thì có `parcelState`; cũ thì phẳng → bọc lại để UI
// chỉ đọc một shape. availableActions=null nghĩa "backend không nói", UI rơi
// về bảng suy theo status.
function normalizeActionResponse(
  raw: unknown,
  parcelId: string,
): AssistantParcelActionData {
  const record = asRecord(raw) ?? {};
  const state = asRecord(record.parcelState);
  const source = state ?? record;

  return {
    parcelState: {
      parcelId: (source.parcelId as string) ?? parcelId,
      parcelCode: (source.parcelCode as string | null) ?? null,
      status: (source.status as string | null) ?? null,
      dropoffLocation:
        (source.dropoffLocation as AssistantParcelActionData["parcelState"]["dropoffLocation"]) ??
        null,
      paymentState:
        (source.paymentState as AssistantParcelActionData["parcelState"]["paymentState"]) ??
        null,
      identityCheckHints:
        (source.identityCheckHints as AssistantParcelActionData["parcelState"]["identityCheckHints"]) ??
        null,
    },
    currentCustody:
      (record.currentCustody as AssistantParcelActionData["currentCustody"]) ??
      null,
    activeIncident:
      (record.activeIncident as AssistantParcelActionData["activeIncident"]) ??
      null,
    createdCustodyEvent:
      (record.createdCustodyEvent as AssistantParcelActionData["createdCustodyEvent"]) ??
      null,
    availableActions: Array.isArray(record.availableActions)
      ? (record.availableActions as string[])
      : null,
    warning: (record.warning as string | null) ?? null,
  };
}

// ===== Manifest ========================================================

export type AssistantParcelManifestParams = {
  stopId?: string;
  status?: string;
  hasException?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
};

// Manifest screen-ready của chuyến (§6.1): một lần gọi ra đủ trip context, số
// liệu tóm tắt, custody/incident và thao tác hợp lệ của từng kiện — không
// N+1 gọi detail cho từng card. Read-only, không cần Idempotency-Key.
export async function getAssistantTripParcels(
  tripId: string,
  params: AssistantParcelManifestParams = {},
): Promise<AssistantParcelManifestData> {
  const query = new URLSearchParams();
  if (params.stopId) query.set("stopId", params.stopId);
  if (params.status) query.set("status", params.status);
  if (params.hasException != null) {
    query.set("hasException", String(params.hasException));
  }
  // Backend giới hạn 100 ký tự; cắt sớm để khỏi ăn 422 chỉ vì gõ dài.
  if (params.search) query.set("search", params.search.trim().slice(0, 100));
  if (params.page != null) query.set("page", String(params.page));
  if (params.pageSize != null) query.set("pageSize", String(params.pageSize));

  const queryString = query.toString();
  const suffix = queryString ? `?${queryString}` : "";
  const raw = await apiRequest<unknown>(
    `/v1/assistant/trips/${tripId}/parcels${suffix}`,
  );
  return normalizeManifest(raw);
}

// ===== QR scan =========================================================

// Quét QR kiện: tra cứu kiện theo mã trong chuyến của assistant. Chỉ đọc,
// KHÔNG đổi trạng thái (dù là POST) và backend đánh dấu [SkipIdempotency].
export async function scanParcelQr(
  tripId: string,
  parcelCode: string,
): Promise<AssistantParcelActionData> {
  const raw = await apiRequest<unknown>(
    `/v1/assistant/trips/${tripId}/parcels/qr-scan`,
    { method: "POST", body: { parcelCode } },
  );
  return normalizeActionResponse(raw, "");
}

// ===== Vòng đời kiện tại xe ===========================================

export type CheckInParcelInput = {
  tripId: string;
  parcelCode: string;
  // Ảnh bằng chứng nhận kiện (URL Firebase đã upload), tối đa 3.
  photoUrls?: string[];
};

// Assistant xác nhận sender mang đúng kiện tới bến (Settlement v2).
// Chỉ nhận kiện RESERVED, đúng trip/code và trước latestCheckInAt.
// Quá hạn chưa check-in → backend tự REJECTED, mất cọc.
export async function checkInParcel(
  parcelId: string,
  input: CheckInParcelInput,
): Promise<AssistantParcelActionData> {
  const raw = await apiRequest<unknown>(
    `/v1/assistant/parcels/${parcelId}/check-in`,
    { method: "POST", body: input },
  );
  return normalizeActionResponse(raw, parcelId);
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
// vượt tải → PENDING_OPERATOR_ACTION. Đây là endpoint DUY NHẤT của nhóm này
// không trả action response (§5.2).
export function reweighParcel(
  parcelId: string,
  input: ReweighParcelInput,
): Promise<ReweighParcelData> {
  return apiRequest<ReweighParcelData>(
    `/v1/assistant/parcels/${parcelId}/reweigh`,
    { method: "POST", body: input },
  );
}

export type LoadParcelInput = {
  tripId: string;
  parcelCode: string;
};

// Assistant scan xếp kiện lên xe. Chỉ nhận kiện READY_TO_LOAD.
// READY_TO_LOAD -> LOADED; custody append LOADED tại ORIGIN_STATION.
export async function loadParcel(
  parcelId: string,
  input: LoadParcelInput,
): Promise<AssistantParcelActionData> {
  const raw = await apiRequest<unknown>(
    `/v1/assistant/parcels/${parcelId}/load`,
    { method: "POST", body: input },
  );
  return normalizeActionResponse(raw, parcelId);
}

// Vị trí dỡ thực tế. `kind` phải ROUTE_STOP kèm đúng dropoffStopId, hoặc
// DESTINATION_STATION kèm đúng bến cuối khi kiện không gắn stop (§7.4).
export type ParcelUnloadLocation = {
  kind: "ROUTE_STOP" | "DESTINATION_STATION";
  id: string;
};

export type UnloadParcelInput = {
  // Bắt buộc: backend chặn dỡ kiện không quét QR (422 PARCEL_SCAN_REQUIRED).
  parcelCode: string;
  actualLocation: ParcelUnloadLocation;
  photoUrls?: string[];
};

// Assistant dỡ kiện khỏi xe. IN_TRANSIT -> UNLOADED, nhả cargo và append
// custody UNLOADED trong cùng transaction. KHÔNG phải bước giao hàng.
// Sai bến → 409 PARCEL_CUSTODY_LOCATION_MISMATCH và backend KHÔNG đổi trạng
// thái, KHÔNG nhả cargo; tuyệt đối không có đường "dỡ ép" qua endpoint này.
// `input` bỏ trống = gọi kiểu contract cũ (production chưa nhận body mới).
export async function unloadParcel(
  parcelId: string,
  input?: UnloadParcelInput,
): Promise<AssistantParcelActionData> {
  const raw = await apiRequest<unknown>(
    `/v1/assistant/parcels/${parcelId}/unload`,
    { method: "POST", ...(input ? { body: input } : {}) },
  );
  return normalizeActionResponse(raw, parcelId);
}

// Assistant giao kiện cho người nhận.
// UNLOADED -> DELIVERED_PENDING_CONFIRM, custody append HANDOFF, revoke token
// cũ và gửi link nhận hàng mới nếu kiện có recipientEmail.
export async function deliverParcel(
  parcelId: string,
  photoUrls?: string[],
): Promise<AssistantParcelActionData> {
  const raw = await apiRequest<unknown>(
    `/v1/assistant/parcels/${parcelId}/deliver`,
    {
      method: "POST",
      ...(photoUrls && photoUrls.length > 0 ? { body: { photoUrls } } : {}),
    },
  );
  return normalizeActionResponse(raw, parcelId);
}

// ===== Custody exception / scan / reconcile (§8) ========================
// Ba route này mới có ở source/local, production chưa deploy — UI chỉ bật khi
// manifest cho thấy backend đã ở contract mới (manifestHasCustodyContract).

// Loại sự cố custody. WRONG_STOP: đã dỡ nhầm bến. PACKAGE_IDENTITY_MISMATCH:
// QR đúng nhưng kiện vật lý không khớp ảnh/cân nặng. UNSCANNED_HANDOFF: bàn
// giao mà không quét được QR.
export type ParcelIncidentType =
  | "WRONG_STOP"
  | "PACKAGE_IDENTITY_MISMATCH"
  | "UNSCANNED_HANDOFF";

export type ParcelCustodyLocationType =
  | "ORIGIN_STATION"
  | "ROUTE_STOP"
  | "DESTINATION_STATION"
  | "VEHICLE";

export type CustodyExceptionInput = {
  incidentType: ParcelIncidentType;
  actualLocationType: ParcelCustodyLocationType;
  // Bắt buộc trừ khi location là VEHICLE.
  actualLocationId?: string | null;
  locationSnapshot?: string | null;
  temporaryExceptionTag?: string | null;
  description?: string | null;
  observedWeightKg?: number | null;
  evidenceUrls?: string[];
  // Bắt buộc, tối đa 1000 ký tự.
  reason: string;
};

// Chuẩn hoá response của report/decision. Backend cũ có thể thiếu vài field
// (rollout), nên điền mặc định an toàn: thiếu status thì coi như đang chờ
// duyệt, KHÔNG suy ra là đã được duyệt.
function normalizeApprovalResponse(
  raw: unknown,
  parcelId: string,
): CustodyExceptionApproval {
  const record = (asRecord(raw) ?? {}) as Record<string, unknown>;
  return {
    ...(record as unknown as CustodyExceptionApproval),
    parcelId: (record.parcelId as string) ?? parcelId,
    status:
      (record.status as CustodyExceptionApprovalStatus | undefined) ??
      "PENDING_APPROVAL",
    evidenceReferences: Array.isArray(record.evidenceReferences)
      ? (record.evidenceReferences as string[])
      : [],
    // Chờ duyệt thì backend trả null; ép null khi thiếu để UI không bao giờ
    // dựng ra một hạn tìm kiếm không có thật.
    searchDeadline: (record.searchDeadline as string | null) ?? null,
    approvedCustodyEventId:
      (record.approvedCustodyEventId as string | null) ?? null,
    availableActions: Array.isArray(record.availableActions)
      ? (record.availableActions as string[])
      : [],
  };
}

// Assistant báo sự cố custody. Từ contract 2026-08-28 endpoint này CHỈ tạo
// một báo cáo chờ duyệt (HTTP 202, status PENDING_APPROVAL): chưa mở
// SEARCHING, chưa sinh search task, chưa ghi custody event. Driver được phân
// công hoặc Operator Web duyệt xong mới bắt đầu tìm kiếm (§6.6, §6.9).
// KHÔNG gửi supervisorApprovalUserId/reviewedByUserId/reviewerUserId —
// backend lấy danh tính người báo cáo từ JWT.
export async function reportCustodyException(
  parcelId: string,
  input: CustodyExceptionInput,
): Promise<CustodyExceptionApproval> {
  const raw = await apiRequest<unknown>(
    `/v1/assistant/parcels/${parcelId}/custody-exception`,
    { method: "POST", body: input },
  );
  return normalizeApprovalResponse(raw, parcelId);
}

// Direct scan chỉ nhận 4 event này (§8.2).
export type ParcelCustodyScanEvent =
  | "ACCEPTED"
  | "ARRIVED_AT_STOP"
  | "HANDOFF"
  | "RETURNED_TO_STATION";

export type CustodyScanInput = {
  parcelCode: string;
  eventType: ParcelCustodyScanEvent;
  actualLocationType: ParcelCustodyLocationType;
  actualLocationId?: string | null;
  locationSnapshot?: string | null;
  evidenceReferences?: string[];
  reason?: string | null;
};

// Ghi nhận một lần quét custody (không đổi status kiện) để chuỗi theo dõi
// không bị đứt — đây cũng là dữ liệu mà reconcile đối chiếu trước khi rời bến.
export async function recordCustodyScan(
  parcelId: string,
  input: CustodyScanInput,
): Promise<AssistantParcelActionData> {
  const raw = await apiRequest<unknown>(
    `/v1/assistant/parcels/${parcelId}/custody-scan`,
    { method: "POST", body: input },
  );
  return normalizeActionResponse(raw, parcelId);
}

export type ReconcileStopInput = {
  scannedParcelIds: string[];
  manualExceptionParcelIds: string[];
  // Chỉ dùng khi còn kiện chưa đối soát mà vẫn phải chạy tiếp; backend đòi có
  // ĐỦ CẢ HAI (lý do + giám sát duyệt) mới trả canDepart=true.
  departureOverrideReason?: string | null;
  supervisorApprovalUserId?: string | null;
};

// Đối soát toàn bộ kiện của một điểm dừng trước khi xe rời đi. Kiện chưa đối
// soát → backend mở incident UNSCANNED_HANDOFF. UI chỉ cho chốt điểm dừng
// khi canDepart=true.
export function reconcileStop(
  tripId: string,
  stopId: string,
  input: ReconcileStopInput,
): Promise<StopReconcileData> {
  return apiRequest<StopReconcileData>(
    `/v1/assistant/trips/${tripId}/stops/${stopId}/reconcile`,
    { method: "POST", body: input },
  );
}

// ===== Crew (DRIVER + ASSISTANT) =======================================

// Crew chuyến ĐÍCH xác nhận đã nhận kiện được operator chuyển sang
// (PENDING_TRANSFER_CONFIRM, cửa sổ xác nhận 30 phút). parcelCode để đối
// chiếu đúng kiện cầm trên tay.
export function confirmParcelTransfer(
  parcelId: string,
  parcelCode: string,
): Promise<ConfirmParcelTransferData> {
  return apiRequest<ConfirmParcelTransferData>(
    `/v1/crew/parcels/${parcelId}/confirm-transfer`,
    { method: "POST", body: { parcelCode } },
  );
}

// Crew (driver + assistant) xác nhận giao thay người nhận khi khách không tự
// confirm qua email. Kiện phải đang DELIVERED_PENDING_CONFIRM (sai → 400
// PARCEL_NOT_PENDING_CONFIRM); sau khi confirm, token của khách bị revoke.
// Body nhận cả alias `note`, nhưng `confirmNote` là tên canonical.
export function confirmParcelDelivery(
  parcelId: string,
  note: string,
): Promise<ManualConfirmParcelData> {
  return apiRequest<ManualConfirmParcelData>(
    `/v1/crew/parcels/${parcelId}/manual-confirm`,
    { method: "POST", body: { confirmNote: note.trim() } },
  );
}

// Gửi lại email xác nhận giao cho người nhận (kiện DELIVERED_PENDING_CONFIRM).
// expiresAt trong response là hạn mới của delivery token.
export function resendDeliveryEmail(
  parcelId: string,
): Promise<ResendDeliveryEmailData> {
  return apiRequest<ResendDeliveryEmailData>(
    `/v1/crew/parcels/${parcelId}/resend-delivery-email`,
    { method: "POST" },
  );
}
