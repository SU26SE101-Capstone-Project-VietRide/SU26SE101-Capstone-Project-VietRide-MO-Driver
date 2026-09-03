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

// Backend trả status parcel dạng string (22 giá trị, Settlement v2). Dùng
// `Record` để thiếu label là lỗi biên dịch chứ không phải chữ "Không rõ trạng
// thái" lặng lẽ tới tay phụ xe.
export const PARCEL_STATUSES = [
  "PENDING_OPERATOR_REVIEW",
  "PENDING_PAYMENT",
  "PENDING",
  "PENDING_ADDITIONAL_PAYMENT",
  "RESERVED",
  "CHECKED_IN",
  "PENDING_FINAL_PAYMENT",
  "READY_TO_LOAD",
  "LOADED",
  "IN_TRANSIT",
  "PENDING_TRANSFER_CONFIRM",
  "TRANSFER_ESCALATED",
  "UNLOADED",
  "DELIVERED_PENDING_CONFIRM",
  "DELIVERY_CONFIRMED",
  "DELIVERY_REJECTED",
  "RETURN_INITIATED",
  "RETURNED",
  "PENDING_OPERATOR_ACTION",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
] as const;

export type ParcelStatusValue = (typeof PARCEL_STATUSES)[number];

const PARCEL_STATUS_META: Record<
  ParcelStatusValue,
  { label: string; tone: Tone }
> = {
  PENDING_OPERATOR_REVIEW: { label: "Chờ duyệt", tone: "info" },
  PENDING_PAYMENT: { label: "Chờ thanh toán cọc", tone: "warning" },
  PENDING: { label: "Chờ xử lý", tone: "neutral" },
  PENDING_ADDITIONAL_PAYMENT: { label: "Chờ phụ phí", tone: "warning" },
  RESERVED: { label: "Đã cọc, chờ tới bến", tone: "info" },
  CHECKED_IN: { label: "Đã nhận tại bến", tone: "info" },
  PENDING_FINAL_PAYMENT: { label: "Chờ khách trả nốt", tone: "warning" },
  READY_TO_LOAD: { label: "Sẵn sàng lên xe", tone: "success" },
  LOADED: { label: "Đã lên xe", tone: "success" },
  IN_TRANSIT: { label: "Đang vận chuyển", tone: "primary" },
  // Đổi xe do sự cố: kiện chờ crew xe MỚI xác nhận đã bốc lên thực tế.
  PENDING_TRANSFER_CONFIRM: {
    label: "Chờ xác nhận chuyển sang xe mới",
    tone: "info",
  },
  // Quá hạn 30 phút xác nhận → crew không tự retry được nữa.
  TRANSFER_ESCALATED: {
    label: "Quá hạn — chờ điều hành xử lý",
    tone: "danger",
  },
  UNLOADED: { label: "Đã dỡ", tone: "info" },
  DELIVERED_PENDING_CONFIRM: {
    label: "Chờ người nhận xác nhận",
    tone: "warning",
  },
  DELIVERY_CONFIRMED: { label: "Đã giao", tone: "success" },
  DELIVERY_REJECTED: { label: "Người nhận từ chối", tone: "danger" },
  RETURN_INITIATED: { label: "Đang hoàn trả", tone: "warning" },
  RETURNED: { label: "Đã hoàn trả", tone: "neutral" },
  PENDING_OPERATOR_ACTION: { label: "Chờ điều hành xử lý", tone: "warning" },
  CANCELLED: { label: "Đã hủy", tone: "danger" },
  REJECTED: { label: "Bị từ chối", tone: "danger" },
  EXPIRED: { label: "Hết hạn", tone: "neutral" },
};

export function parcelStatusMeta(status: string | null | undefined): {
  label: string;
  tone: Tone;
} {
  const meta = PARCEL_STATUS_META[status as ParcelStatusValue];
  if (meta) {
    return meta;
  }
  unknownEnum("parcel status", status);
  return { label: "Không rõ trạng thái", tone: "neutral" };
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
      unknownEnum("kích cỡ kiện", size);
      // Card đã ghép sẵn tiền tố "Kích cỡ …" nên nhãn chỉ cần "Không rõ".
      return "Không rõ";
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
  | "custody-exception"
  // Reliability v2 §8: kiện đang bị mở phiếu tìm kiếm nhưng thực ra vẫn trên
  // xe — quét QR xác nhận để đóng phiếu và trả kiện về luồng bình thường.
  | "confirm-found-on-vehicle"
  // Chỉ xem trạng thái sự cố, không mutate (§13).
  | "view-incident";

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
  CONFIRM_FOUND_ON_VEHICLE: "confirm-found-on-vehicle",
  VIEW_INCIDENT: "view-incident",
};

// Vòng đời đã đóng: không thao tác nào của crew còn hợp lệ.
const TERMINAL_STATUSES = new Set([
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
  "RETURNED",
  "DELIVERY_CONFIRMED",
]);

// Kiện đang nằm trong tay crew (đã nhận tại bến, chưa giao xong) → được ghi
// nhận custody và báo sự cố ở mọi bước. Trước khi check-in kiện còn ở tay
// khách, sau khi kết thúc vòng đời thì không còn gì để ghi nhận.
const CUSTODY_STATUSES = new Set([
  "CHECKED_IN",
  "PENDING_FINAL_PAYMENT",
  "READY_TO_LOAD",
  "LOADED",
  "IN_TRANSIT",
  "PENDING_TRANSFER_CONFIRM",
  "TRANSFER_ESCALATED",
  "UNLOADED",
  "DELIVERED_PENDING_CONFIRM",
  "PENDING_OPERATOR_ACTION",
]);

// Thao tác nào HỢP LỆ ở trạng thái này — ràng buộc nghiệp vụ phía client.
// §11 nói backend là nguồn truth, nhưng resolver của backend đã sai hai lần
// (quên REWEIGH ở CHECKED_IN, trả CUSTODY_SCAN cho kiện REJECTED) nên app
// giao đúng phần của mình: backend quyết định CÓ CHO hay không, còn bảng này
// chặn những thao tác mà nghiệp vụ vốn đã không cho phép.
function businessRuleActions(status: string | null): ParcelAction[] {
  if (TERMINAL_STATUSES.has(status ?? "")) {
    return [];
  }

  const lifecycle = allowedParcelActions(status);
  // Hai action liên quan sự cố không gắn với một status cụ thể: backend chỉ trả
  // khi kiện đang có incident phù hợp, nên cứ có là cho hiện (Playbook v2 §8,
  // §13). `confirm-found-on-vehicle` đặc biệt quan trọng — đó là đường DUY NHẤT
  // để crew gỡ kiện khỏi PENDING_OPERATOR_ACTION khi hàng vẫn nằm trên xe.
  const incidentActions: ParcelAction[] = [
    "confirm-found-on-vehicle",
    "view-incident",
  ];

  return CUSTODY_STATUSES.has(status ?? "")
    ? [...lifecycle, ...incidentActions, "custody-scan", "custody-exception"]
    : [...lifecycle, ...incidentActions];
}

// Danh sách thao tác cho một card = giao của `availableActions` (backend) và
// bảng ràng buộc theo status. Backend còn contract cũ (không trả
// availableActions) thì dùng thẳng bảng ràng buộc.
export function resolveParcelActions(parcel: {
  status: string | null;
  availableActions?: string[] | null;
}): ParcelAction[] {
  const allowed = businessRuleActions(parcel.status);

  if (!Array.isArray(parcel.availableActions)) {
    return allowed;
  }

  const actions: ParcelAction[] = [];
  for (const raw of parcel.availableActions) {
    const mapped = SERVER_ACTION_MAP[raw];
    // Backend thêm action mới mà app chưa biết vẽ nút → bỏ qua, không đoán.
    // Backend trả action mà status không cho phép (vd CUSTODY_SCAN trên kiện
    // REJECTED) → cũng bỏ, bấm vào chỉ ăn VALIDATION_ERROR.
    if (mapped && allowed.includes(mapped) && !actions.includes(mapped)) {
      actions.push(mapped);
    }
  }

  // Trước đây app tự thêm `REWEIGH` cho kiện CHECKED_IN vì resolver backend
  // quên trả. Playbook Reliability v2 §13 cấm hẳn: "Nếu action không có: không
  // render nút, kể cả FE nghĩ status có vẻ hợp lệ" — nên workaround đã bỏ.
  // Kiện CHECKED_IN mà không có nút cân/đo nghĩa là backend chưa cho phép;
  // báo BE chứ không tự vẽ nút rồi để phụ xe bấm vào lỗi.
  return actions;
}

// ===== Đổi xe do sự cố ================================================
// docs/Implements/MOBILE-VEHICLE-SUBSTITUTION-PARCEL-TRANSFER.md.

type TransferFields = {
  status: string | null;
  transferContext?: string | null;
  sourceTripId?: string | null;
  targetTripId?: string | null;
  transferTargetTripId?: string | null;
};

// Chuyến đích của kiện đang chờ chuyển. Backend đổi tên field giữa hai bản
// handoff (`targetTripId` ↔ `transferTargetTripId`) nên đọc cả hai.
export function transferTargetTripOf(parcel: TransferFields): string | null {
  return parcel.targetTripId ?? parcel.transferTargetTripId ?? null;
}

// Kiện "incoming": nằm trong manifest chuyến này nhưng thực tế còn ở xe cũ,
// chờ crew bốc sang rồi xác nhận. `tripId` của nó VẪN là chuyến cũ.
export function isIncomingTransfer(parcel: TransferFields): boolean {
  if (parcel.transferContext === "TRANSFER_IN") {
    return true;
  }
  // Backend chưa gửi transferContext thì suy theo status — chỉ hai trạng thái
  // này mới có nghĩa "đang chờ chuyển".
  return (
    parcel.status === "PENDING_TRANSFER_CONFIRM" ||
    parcel.status === "TRANSFER_ESCALATED"
  );
}

// Chỉ crew của chuyến ĐÍCH được xác nhận. Crew chuyến cũ mở cùng kiện thì
// không được thấy nút, nếu không hai bên bấm chồng nhau. Backend không gửi đủ
// field để phân biệt thì cho qua — `availableActions` của nó đã là nguồn truth.
export function canConfirmTransferHere(
  parcel: TransferFields,
  tripId: string | null,
): boolean {
  const target = transferTargetTripOf(parcel);
  if (!target || !tripId) {
    return true;
  }
  return target === tripId;
}

// Số điện thoại backend trả dạng E.164 (`+84888151546`) — dài, dính liền, phụ
// xe đọc để gọi cho người nhận rất dễ nhầm. Đưa về dạng nội địa quen mắt:
// +84888151546 → 0888 151 546. Số không nhận dạng được thì trả nguyên văn,
// KHÔNG cắt xén (thà xấu còn hơn gọi nhầm số).
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) {
    return "";
  }
  const digits = phone.replace(/[^\d+]/g, "");
  const local = digits.startsWith("+84")
    ? `0${digits.slice(3)}`
    : digits.startsWith("84") && digits.length === 11
      ? `0${digits.slice(2)}`
      : digits;

  // Di động VN sau chuyển đổi đầu số: 10 chữ số, nhóm 4-3-3.
  if (/^0\d{9}$/.test(local)) {
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  }
  // Số cố định/đầu số cũ 11 số: nhóm 4-3-4.
  if (/^0\d{10}$/.test(local)) {
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
  }
  return local;
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
    // Tên có thể chỉ là mã kỹ thuật (id điểm dừng) — khi đó dùng nhãn theo
    // loại vị trí, đừng đưa id lên màn hình.
    const name = humanizeLocationSnapshot(location.name);
    if (!name) {
      return locationTypeLabel(location.type);
    }
    // `orderIndex` của backend đánh số từ 1 (API-Trip: `orderIndex>0`, và mọi
    // ví dụ trong docs đều bắt đầu từ 1) → in thẳng, KHÔNG cộng thêm. Cộng 1
    // thì điểm dừng đầu tiên hiện thành "điểm 2", lệch với màn chuyến và màn
    // điểm dừng vốn in nguyên orderIndex.
    return location.orderIndex != null
      ? `${name} (điểm ${location.orderIndex})`
      : name;
  }
  return locationTypeLabel(location.type);
}

// Ghép câu mô tả vị trí cho tự nhiên. Ghép cứng "tại " + nhãn thì ra
// "…tại Trên xe" — sai ngữ pháp và đọc rất kỳ. "Trên xe"/"Kho hàng" cần giới
// từ khác với tên bến.
export function locationPhrase(
  location:
    | { type?: string | null; name?: string | null; orderIndex?: number | null }
    | null
    | undefined,
): string {
  const label = locationLabel(location);
  if (label === "—") {
    return "chưa rõ vị trí";
  }
  // "Trên xe", "Trên xe 51B-12345" → không thêm "tại", và viết thường vì nó
  // nằm GIỮA câu ("Nhận từ chuyến khác trên xe"), không phải đầu câu.
  if (label.startsWith("Trên xe")) {
    return `trên xe${label.slice("Trên xe".length)}`;
  }
  if (label.startsWith("Kho hàng")) {
    return `tại kho hàng${label.slice("Kho hàng".length)}`;
  }
  if (label === "Vị trí khác") {
    return "ở vị trí khác";
  }
  return `tại ${label}`;
}

const LOCATION_TYPE_LABELS: Record<string, string> = {
  ORIGIN_STATION: "Bến đi",
  DESTINATION_STATION: "Bến cuối",
  ROUTE_STOP: "Điểm dừng dọc đường",
  VEHICLE: "Trên xe",
  WAREHOUSE: "Kho hàng",
};

function locationTypeLabel(type: string | null | undefined): string {
  const label = LOCATION_TYPE_LABELS[type ?? ""];
  if (label) {
    return label;
  }
  unknownEnum("location type", type);
  return "Vị trí khác";
}

// UUID đầy đủ, và cả UUID bị cắt cụt ("4f0c1234-5678-…") vì backend/log có
// lúc rút gọn. Không neo đầu-cuối để dò được id nằm lẫn giữa câu.
const ID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}(?:-[0-9a-f]{4})?(?:-[0-9a-f]{4})?(?:-[0-9a-f]{0,12})?/gi;

// Chuỗi không còn gì cho người đọc: rỗng, hoặc chỉ còn một chuỗi hex/số dài —
// tức là mã kỹ thuật, không phải tên bến. Ngưỡng 12 ký tự để KHÔNG bắt oan
// biển số xe ("51B-12345" toàn ký tự hex nhưng là thông tin thật cần hiện).
function isIdentifierOnly(value: string): boolean {
  const cleaned = value.replace(/[\s\-_:.,()•…]+/g, "");
  return (
    cleaned.length === 0 ||
    /^[0-9a-f]{12,}$/i.test(cleaned) ||
    /^\d{8,}$/.test(cleaned)
  );
}

// Bỏ mọi mã id lẫn trong tên rồi dọn dấu ngoặc/gạch còn treo lại, để
// "Bến A (4f0c1234-…)" ra "Bến A" chứ không phải "Bến A ()".
function stripIdentifiers(value: string): string {
  return value
    .replace(ID_PATTERN, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s*[•·|]\s*$/g, "")
    .replace(/[\s\-_:,]+$/g, "")
    .replace(/^[\s\-_:,]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// `locationSnapshot` backend gửi có khi là chuỗi kỹ thuật dạng
// "VEHICLE: 4f0c…" hoặc "ROUTE_STOP: <uuid>" — để nguyên là enum thô lòi lên
// màn hình phụ xe (quan sát thực tế 30/08: "Nhận từ chuyến khác tại VEHICLE:
// …"). Bóc tiền tố enum ra, dịch sang tiếng Việt; phần đuôi là UUID thì bỏ
// hẳn vì phụ xe không đọc được, còn biển số/tên bến thì giữ lại.
//
// Trả về chuỗi rỗng khi tên chỉ là mã kỹ thuật (không có tiền tố enum để dịch,
// ví dụ snapshot đúng bằng id điểm dừng) — người gọi rơi về nhãn theo loại vị
// trí. Đây là ca đã lòi id lên card "Đã dỡ khỏi xe tại …".
function humanizeLocationSnapshot(name: string): string {
  const trimmed = name.trim();
  // Tiền tố enum: chấp cả chữ thường vì snapshot của backend không nhất quán.
  const match = trimmed.match(/^([A-Za-z][A-Za-z_]{3,})\s*[:\-–]\s*(.*)$/);
  if (!match) {
    const detail = stripIdentifiers(trimmed);
    return isIdentifierOnly(detail) ? "" : detail;
  }
  const [, rawType, rest] = match;
  const label = LOCATION_TYPE_LABELS[rawType.toUpperCase()];
  const detail = stripIdentifiers(rest);
  if (!label) {
    unknownEnum("location snapshot type", rawType);
    return isIdentifierOnly(detail) ? "" : detail;
  }
  return isIdentifierOnly(detail) ? label : `${label} ${detail}`;
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

// Ba bảng enum dưới đây cố tình viết dưới dạng `Record<Enum, string>` chứ
// không phải `switch`: thêm một giá trị vào union mà quên label thì `tsc` báo
// lỗi ngay, còn `switch` chỉ lặng lẽ rơi xuống `default` rồi hiện chữ chung
// chung cho phụ xe (FE-PCL-006). Test đi kèm duyệt hết key của bảng nên nhánh
// fallback không bao giờ được dùng cho enum đã biết.

// ParcelIncidentType hiện tại (FE-Driver-Assistant-Parcel-Integration-Guide (2)
// §E1 và Flow H §14).
export const INCIDENT_TYPES = [
  "MISSING",
  "MISSING_AFTER_DEPARTURE",
  "WRONG_STOP",
  "DELIVERY_NOT_RECEIVED",
  "PARTIAL_LOSS",
  "DAMAGED",
  "SCAN_IDENTITY_MISMATCH",
  "PACKAGE_IDENTITY_MISMATCH",
  "UNSCANNED_HANDOFF",
  "FORWARDING",
] as const;

export type ParcelIncidentType = (typeof INCIDENT_TYPES)[number];

const INCIDENT_TYPE_LABELS: Record<ParcelIncidentType, string> = {
  MISSING: "Không tìm thấy kiện",
  MISSING_AFTER_DEPARTURE: "Mất kiện sau khi rời bến",
  WRONG_STOP: "Dỡ nhầm điểm",
  DELIVERY_NOT_RECEIVED: "Người nhận báo chưa nhận được",
  PARTIAL_LOSS: "Thiếu một phần hàng",
  DAMAGED: "Kiện bị hư hỏng",
  SCAN_IDENTITY_MISMATCH: "Mã quét không khớp kiện",
  PACKAGE_IDENTITY_MISMATCH: "Kiện không khớp mô tả",
  UNSCANNED_HANDOFF: "Bàn giao không quét QR",
  // Flow H: điều hành đã tìm thấy kiện và chọn chuyến khác chở tiếp. Kiện
  // KHÔNG còn thất lạc, nên tuyệt đối không dùng chữ mang nghĩa sự cố nặng.
  FORWARDING: "Đang chuyển sang chuyến khác",
};

export function incidentTypeLabel(type: string | null | undefined): string {
  const label = INCIDENT_TYPE_LABELS[type as ParcelIncidentType];
  if (label) {
    return label;
  }
  unknownEnum("incident type", type);
  return "Sự cố kiện";
}

export const INCIDENT_STATUSES = [
  "OPEN",
  "SEARCHING",
  "FORWARDING",
  "RESOLVED",
  "ESCALATED",
  "LOST_CONFIRMED",
] as const;

export type ParcelIncidentStatus = (typeof INCIDENT_STATUSES)[number];

const INCIDENT_STATUS_LABELS: Record<ParcelIncidentStatus, string> = {
  // Contract 2026-08-28: incident vừa được Assistant báo cáo nằm ở OPEN cho
  // tới khi Driver/điều hành duyệt. Chưa duyệt thì CHƯA có ai đi tìm kiện,
  // nên không được hiển thị "đang tìm kiếm" ở trạng thái này (§6.6).
  OPEN: "Chờ phê duyệt",
  SEARCHING: "Đang tìm kiếm",
  // Flow H (§14): kiện đã tìm thấy, điều hành chuyển sang chuyến khác chở
  // tiếp, chờ crew chuyến đích quét xác nhận.
  FORWARDING: "Đã tìm thấy, đang chuyển sang chuyến khác",
  RESOLVED: "Đã xử lý",
  ESCALATED: "Đã báo cấp trên",
  LOST_CONFIRMED: "Xác nhận thất lạc",
};

export function incidentStatusLabel(status: string | null | undefined): string {
  const label = INCIDENT_STATUS_LABELS[status as ParcelIncidentStatus];
  if (label) {
    return label;
  }
  unknownEnum("incident status", status);
  return "Chưa rõ trạng thái";
}

// Trạng thái phê duyệt của một báo cáo sự cố custody (§6.9). Assistant chỉ
// tạo được PENDING_APPROVAL; ba trạng thái còn lại do Driver/điều hành quyết.
export const CUSTODY_APPROVAL_STATUSES = [
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;

export type CustodyApprovalStatusValue =
  (typeof CUSTODY_APPROVAL_STATUSES)[number];

const CUSTODY_APPROVAL_STATUS_LABELS: Record<
  CustodyApprovalStatusValue,
  string
> = {
  PENDING_APPROVAL: "Chờ phê duyệt",
  APPROVED: "Đã duyệt, đang tìm kiếm",
  REJECTED: "Đã bị từ chối",
  CANCELLED: "Đã hủy báo cáo",
};

export function custodyApprovalStatusLabel(
  status: string | null | undefined,
): string {
  const label =
    CUSTODY_APPROVAL_STATUS_LABELS[status as CustodyApprovalStatusValue];
  if (label) {
    return label;
  }
  unknownEnum("custody approval status", status);
  return "Chưa rõ trạng thái duyệt";
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

// Rời điểm bị chặn vì còn kiện chưa đối soát (Guide (2) §F5). Trả về id của
// phiếu xin rời điểm đang chờ để tài xế mở đúng phiếu đó — §19 cấm tự dựng một
// phê duyệt cục bộ.
export function stopDepartureBlocked(error: unknown): string | null {
  if (
    !(error instanceof ApiError) ||
    error.code !== "PARCEL_STOP_RECONCILIATION_REQUIRED"
  ) {
    return null;
  }
  return (
    error.fields?.find((item) => item.field === "approvalRequestId")?.message ??
    null
  );
}

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

// ===== Đối soát tại bến cuối (FE-PCL-004) =============================
//
// `canComplete` KHÔNG có nghĩa "đã giao đủ kiện". Backend bật cờ này cả khi
// chuyến chỉ còn sự cố đã được ghi nhận (clearance ACKNOWLEDGED_INCIDENTS) —
// tức là vẫn còn kiện nằm trên xe nhưng tài xế được phép đóng chuyến. Bản E2E
// production 2026-08-31 bắt được card hiện "Xong, giao đủ kiện" ngay cạnh dòng
// "Đã giao 0/5": đó là báo thành công giả về an toàn hàng hóa.
//
// Nguồn sự thật cho "giao đủ" phải là số đếm (hoặc cờ `allDelivered` khi
// BE-PCL-004 trả), không phải `canComplete`.
export type DestinationReconcileCounts = {
  expectedCount: number;
  scannedCount: number;
  canComplete: boolean;
  unresolvedCount?: number;
  // BE-PCL-004 (đề xuất): cờ riêng tách bạch khỏi `canComplete`. Chưa có thì
  // undefined và FE suy theo số đếm.
  allDelivered?: boolean | null;
};

export type DestinationReconcileMeta = {
  label: string;
  tone: Tone;
  // Câu giải thích thêm khi trạng thái không phải trắng-đen. null = không cần.
  hint: string | null;
};

export function destinationReconcileMeta(
  result: DestinationReconcileCounts,
): DestinationReconcileMeta {
  const unresolved = result.unresolvedCount ?? 0;
  // Cờ của backend thắng khi có; không có thì đủ số VÀ không còn kiện treo.
  const allDelivered =
    result.allDelivered ??
    (result.scannedCount >= result.expectedCount && unresolved === 0);

  if (result.expectedCount === 0) {
    return {
      label: "Chuyến không có kiện",
      tone: "neutral",
      hint: null,
    };
  }

  if (allDelivered) {
    return { label: "Xong, giao đủ kiện", tone: "success", hint: null };
  }

  // Còn thiếu kiện nhưng backend vẫn cho đóng chuyến: phải nói rõ là "đủ điều
  // kiện hoàn tất", tuyệt đối không được để chữ "giao đủ" xuất hiện.
  if (result.canComplete) {
    return {
      label: "Đủ điều kiện hoàn tất với sự cố đã ghi nhận",
      tone: "warning",
      hint: "Vẫn còn kiện chưa giao. Kiểm lại danh sách bên dưới trước khi rời bến.",
    };
  }

  return {
    label: "Còn kiện chưa giao",
    tone: "danger",
    hint: null,
  };
}
