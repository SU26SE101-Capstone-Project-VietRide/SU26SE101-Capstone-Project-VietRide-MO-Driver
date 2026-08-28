import { ApiError } from "@/api/client";
import type { Tone } from "@/features/operations/mock-data";

// Format mã kiện chính thức (API-Parcel_NEWST.md): bản mới VR-PCL-yyyymmdd-8
// ký tự (bỏ I,O,0,1 tránh nhầm mắt) hoặc bản legacy VRP-. Dùng để lọc sớm
// chuỗi quét từ QR — mã vé (VT-...) hay chuỗi lạ thì khỏi gọi API.
const PARCEL_CODE_PATTERN =
  /^(VR-PCL-\d{8}-[A-HJ-NP-Z2-9]{8}|VRP-\d{8}-[A-Z0-9]{8})$/;

export function isParcelCode(code: string): boolean {
  return PARCEL_CODE_PATTERN.test(code.trim());
}

// Enum lạ (backend thêm giá trị mới) không được lòi ra UI vì đây là app tiếng
// Việt — chỉ log ở dev để còn phát hiện mà bổ sung label, còn người dùng luôn
// thấy một câu tiếng Việt.
function unknownEnum(kind: string, value: string | null | undefined): void {
  if (__DEV__ && value != null && value !== "") {
    console.warn(
      `[parcel-format] chưa có label tiếng Việt cho ${kind}: ${value}`,
    );
  }
}

// Backend trả status parcel dạng string (22 giá trị, Settlement v2) → map
// defensive, có fallback.
export function parcelStatusMeta(status: string | null | undefined): {
  label: string;
  tone: Tone;
} {
  switch (status) {
    case "PENDING_OPERATOR_REVIEW":
      return { label: "Chờ duyệt", tone: "info" };
    case "PENDING_PAYMENT":
      return { label: "Chờ thanh toán cọc", tone: "warning" };
    case "PENDING":
      return { label: "Chờ xử lý", tone: "neutral" };
    case "PENDING_ADDITIONAL_PAYMENT":
      return { label: "Chờ phụ phí", tone: "warning" };
    case "RESERVED":
      return { label: "Đã cọc, chờ tới bến", tone: "info" };
    case "CHECKED_IN":
      return { label: "Đã nhận tại bến", tone: "info" };
    case "PENDING_FINAL_PAYMENT":
      return { label: "Chờ khách trả nốt", tone: "warning" };
    case "READY_TO_LOAD":
      return { label: "Sẵn sàng lên xe", tone: "success" };
    case "LOADED":
      return { label: "Đã lên xe", tone: "success" };
    case "IN_TRANSIT":
      return { label: "Đang vận chuyển", tone: "primary" };
    case "PENDING_TRANSFER_CONFIRM":
      return { label: "Chờ xác nhận chuyển", tone: "info" };
    case "TRANSFER_ESCALATED":
      return { label: "Chuyển vượt cấp", tone: "warning" };
    case "UNLOADED":
      return { label: "Đã dỡ", tone: "info" };
    case "DELIVERED_PENDING_CONFIRM":
      return { label: "Chờ người nhận xác nhận", tone: "warning" };
    case "DELIVERY_CONFIRMED":
      return { label: "Đã giao", tone: "success" };
    case "DELIVERY_REJECTED":
      return { label: "Người nhận từ chối", tone: "danger" };
    case "RETURN_INITIATED":
      return { label: "Đang hoàn trả", tone: "warning" };
    case "RETURNED":
      return { label: "Đã hoàn trả", tone: "neutral" };
    case "PENDING_OPERATOR_ACTION":
      return { label: "Chờ điều hành xử lý", tone: "warning" };
    case "CANCELLED":
      return { label: "Đã hủy", tone: "danger" };
    case "REJECTED":
      return { label: "Bị từ chối", tone: "danger" };
    case "EXPIRED":
      return { label: "Hết hạn", tone: "neutral" };
    default:
      unknownEnum("parcel status", status);
      return { label: "Không rõ trạng thái", tone: "neutral" };
  }
}

// Tiền VND từ backend là số nguyên đồng → "2.700 đ". Null/NaN trả "—".
export function formatVnd(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) {
    return "—";
  }
  const grouped = Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped} đ`;
}

export function sizeCategoryLabel(size: string | null | undefined): string {
  switch (size) {
    case "SMALL":
      return "Nhỏ";
    case "MEDIUM":
      return "Vừa";
    case "LARGE":
      return "Lớn";
    case "EXTRA_LARGE":
      return "Rất lớn";
    default:
      return size ?? "—";
  }
}

// Thao tác Assistant được phép theo trạng thái. Backend vẫn là source of truth
// (trả INVALID_STATUS nếu sai), đây chỉ để hiển thị đúng nút.
// Chuỗi Settlement v2:
// RESERVED -> check-in -> CHECKED_IN -> reweigh -> PENDING_FINAL_PAYMENT
//   (khách trả nốt) -> READY_TO_LOAD -> load -> LOADED -> (chuyến chạy)
//   -> IN_TRANSIT -> unload -> UNLOADED -> deliver -> DELIVERED_PENDING_CONFIRM
//   -> confirm-delivery -> DELIVERY_CONFIRMED
// Reweigh đủ tiền/thừa cọc thì nhảy thẳng CHECKED_IN -> READY_TO_LOAD.
export type ParcelAction =
  | "check-in"
  | "reweigh"
  | "load"
  | "unload"
  | "deliver"
  | "confirm-delivery"
  | "confirm-transfer"
  | "resend-email"
  // Custody v2 (API-Parcel-Driver.md §8): ghi nhận quét và báo sự cố.
  | "custody-scan"
  | "custody-exception";

export function allowedParcelActions(
  status: string | null | undefined,
): ParcelAction[] {
  switch (status) {
    case "RESERVED":
      return ["check-in"];
    case "CHECKED_IN":
      return ["reweigh"];
    case "READY_TO_LOAD":
      return ["load"];
    case "IN_TRANSIT":
      return ["unload"];
    case "UNLOADED":
      return ["deliver"];
    case "DELIVERED_PENDING_CONFIRM":
      // resend-email: gửi lại email xác nhận cho người nhận (gia hạn token).
      return ["confirm-delivery", "resend-email"];
    // Kiện được operator chuyển sang chuyến này — crew xác nhận đã nhận
    // (docs/Implements/API-Parcel-QR-Crew.md).
    case "PENDING_TRANSFER_CONFIRM":
      return ["confirm-transfer"];
    default:
      // PENDING_FINAL_PAYMENT chờ khách trả qua app khách — Assistant không có
      // thao tác. PENDING/PENDING_ADDITIONAL_PAYMENT là legacy đã được BE
      // migrate sang status v2, không còn thao tác trực tiếp.
      return [];
  }
}

// ===== Contract custody v2 (docs/Implements/API-Parcel-Driver.md) =====

// Tên thao tác backend trả trong `availableActions`. §11: backend là nguồn
// truth, FE chỉ enable CTA có trong danh sách — không tự suy từ status.
const SERVER_ACTION_MAP: Record<string, ParcelAction> = {
  CHECK_IN: "check-in",
  REWEIGH: "reweigh",
  LOAD: "load",
  UNLOAD: "unload",
  DELIVER: "deliver",
  CONFIRM_DELIVERY: "confirm-delivery",
  MANUAL_CONFIRM: "confirm-delivery",
  CONFIRM_TRANSFER: "confirm-transfer",
  RESEND_DELIVERY_EMAIL: "resend-email",
  RESEND_EMAIL: "resend-email",
  CUSTODY_SCAN: "custody-scan",
  CUSTODY_EXCEPTION: "custody-exception",
};

// Danh sách thao tác cho một card. Có `availableActions` (contract mới) thì
// dùng nguyên; backend production còn cũ thì rơi về bảng suy theo status.
export function resolveParcelActions(parcel: {
  status: string | null;
  availableActions?: string[] | null;
}): ParcelAction[] {
  if (!Array.isArray(parcel.availableActions)) {
    return allowedParcelActions(parcel.status);
  }

  const actions: ParcelAction[] = [];
  for (const raw of parcel.availableActions) {
    const mapped = SERVER_ACTION_MAP[raw];
    // Backend thêm action mới mà app chưa biết vẽ nút → bỏ qua, không đoán.
    if (mapped && !actions.includes(mapped)) {
      actions.push(mapped);
    }
  }

  // WORKAROUND gap backend (FE-Driver-Assistant-Parcel-Integration-Guide.md §9
  // và §13.1): resolver của backend quên `REWEIGH` cho kiện `CHECKED_IN`, chỉ
  // trả `CUSTODY_SCAN`. Nếu bám nguyên availableActions thì card mất hẳn bước
  // cân/đo — phụ xe không đi tiếp được tới READY_TO_LOAD.
  // XOÁ khối này ngay khi backend sửa resolver.
  if (parcel.status === "CHECKED_IN" && !actions.includes("reweigh")) {
    actions.push("reweigh");
  }

  return actions;
}

// Vị trí custody hiển thị gọn: ưu tiên tên bến/điểm dừng backend snapshot.
export function locationLabel(
  location:
    | { type?: string | null; name?: string | null; orderIndex?: number | null }
    | null
    | undefined,
): string {
  if (!location) {
    return "—";
  }
  if (location.name) {
    return location.orderIndex != null
      ? `${location.name} (điểm ${location.orderIndex + 1})`
      : location.name;
  }
  switch (location.type) {
    case "ORIGIN_STATION":
      return "Bến đi";
    case "DESTINATION_STATION":
      return "Bến cuối";
    case "ROUTE_STOP":
      return "Điểm dừng dọc đường";
    case "VEHICLE":
      return "Trên xe";
    default:
      unknownEnum("location type", location.type);
      return "Vị trí khác";
  }
}

// Loại custody event (lastEventType / createdCustodyEvent.eventType).
export function custodyEventLabel(eventType: string | null | undefined): string {
  switch (eventType) {
    case "ACCEPTED":
      return "Đã nhận kiện";
    // Backend append event này khi check-in tại bến (RESERVED -> CHECKED_IN).
    case "CHECKED_IN":
      return "Đã nhận tại bến";
    case "LOADED":
      return "Đã lên xe";
    case "ARRIVED_AT_STOP":
      return "Đã tới điểm dừng";
    case "UNLOADED":
      return "Đã dỡ khỏi xe";
    case "HANDOFF":
      return "Đã bàn giao";
    case "RETURNED_TO_STATION":
      return "Đã trả về bến";
    case "FORWARDED_OUT":
      return "Đã chuyển sang chuyến khác";
    case "FORWARDED_IN":
      return "Nhận từ chuyến khác";
    case "MANUAL_CUSTODY_EXCEPTION":
      return "Báo sự cố thủ công";
    default:
      unknownEnum("custody event", eventType);
      return "Ghi nhận khác";
  }
}

// Độ tin cậy của chuỗi theo dõi. Không phải CONFIRMED_SCAN nghĩa là vị trí
// đang được suy đoán → nhắc phụ xe quét lại trước khi thao tác tiếp.
export function trackingConfidenceMeta(confidence: string | null | undefined): {
  label: string;
  tone: Tone;
} {
  switch (confidence) {
    case "CONFIRMED_SCAN":
      return { label: "Đã quét xác nhận", tone: "success" };
    case "INFERRED":
      return { label: "Suy đoán từ chuyến", tone: "warning" };
    case "UNKNOWN":
      return { label: "Chưa rõ vị trí", tone: "danger" };
    default:
      unknownEnum("tracking confidence", confidence);
      return { label: "Chưa rõ độ tin cậy", tone: "neutral" };
  }
}

export function incidentTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case "WRONG_STOP":
      return "Dỡ nhầm điểm";
    case "PACKAGE_IDENTITY_MISMATCH":
      return "Kiện không khớp mô tả";
    case "UNSCANNED_HANDOFF":
      return "Bàn giao không quét QR";
    case "MISSING_PARCEL":
      return "Thất lạc kiện";
    default:
      unknownEnum("incident type", type);
      return "Sự cố kiện";
  }
}

export function incidentStatusLabel(status: string | null | undefined): string {
  switch (status) {
    // Contract 2026-08-28: incident vừa được Assistant báo cáo nằm ở OPEN cho
    // tới khi Driver/điều hành duyệt. Chưa duyệt thì CHƯA có ai đi tìm kiện,
    // nên không được hiển thị "đang tìm kiếm" ở trạng thái này (§6.6).
    case "OPEN":
      return "Chờ phê duyệt";
    case "SEARCHING":
      return "Đang tìm kiếm";
    case "RESOLVED":
      return "Đã xử lý";
    case "ESCALATED":
      return "Đã báo cấp trên";
    case "LOST_CONFIRMED":
      return "Xác nhận thất lạc";
    default:
      unknownEnum("incident status", status);
      return "Chưa rõ trạng thái";
  }
}

// Trạng thái phê duyệt của một báo cáo sự cố custody (§6.9). Assistant chỉ
// tạo được PENDING_APPROVAL; ba trạng thái còn lại do Driver/điều hành quyết.
export function custodyApprovalStatusLabel(
  status: string | null | undefined,
): string {
  switch (status) {
    case "PENDING_APPROVAL":
      return "Chờ phê duyệt";
    case "APPROVED":
      return "Đã duyệt, đang tìm kiếm";
    case "REJECTED":
      return "Đã bị từ chối";
    case "CANCELLED":
      return "Đã hủy báo cáo";
    default:
      unknownEnum("custody approval status", status);
      return "Chưa rõ trạng thái duyệt";
  }
}

// Hành động backend khuyến nghị trong reconcile/lỗi mismatch.
export function recommendedActionLabel(action: string | null | undefined): string {
  switch (action) {
    case "SEARCH_VEHICLE_OR_STATION":
      return "Tìm lại kiện trên xe hoặc tại bến.";
    case "KEEP_ON_VEHICLE_OR_REPORT_CUSTODY_EXCEPTION":
      return "Giữ kiện trên xe, hoặc báo sự cố nếu đã lỡ dỡ xuống.";
    default:
      unknownEnum("recommended action", action);
      return "Liên hệ điều hành để được hướng dẫn.";
  }
}

// Lỗi 409 PARCEL_CUSTODY_LOCATION_MISMATCH mang structured fields
// (expectedStop, actualStop, requiredAction). §10: phải hiển thị đúng bến
// mong đợi và hành động bắt buộc, KHÔNG cho phép "dỡ ép".
export type CustodyLocationMismatch = {
  expectedStop: string | null;
  actualStop: string | null;
  requiredAction: string | null;
};

export function custodyLocationMismatch(
  error: unknown,
): CustodyLocationMismatch | null {
  if (
    !(error instanceof ApiError) ||
    error.code !== "PARCEL_CUSTODY_LOCATION_MISMATCH"
  ) {
    return null;
  }
  const fields = Object.fromEntries(
    (error.fields ?? []).map((item) => [item.field, item.message]),
  );
  return {
    expectedStop: fields.expectedStop ?? null,
    actualStop: fields.actualStop ?? null,
    requiredAction: fields.requiredAction ?? null,
  };
}
