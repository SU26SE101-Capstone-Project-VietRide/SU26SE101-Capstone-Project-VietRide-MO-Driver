import type { Tone } from "@/features/operations/mock-data";

// Format mã kiện chính thức (API-Parcel_NEWST.md): bản mới VR-PCL-yyyymmdd-8
// ký tự (bỏ I,O,0,1 tránh nhầm mắt) hoặc bản legacy VRP-. Dùng để lọc sớm
// chuỗi quét từ QR — mã vé (VT-...) hay chuỗi lạ thì khỏi gọi API.
const PARCEL_CODE_PATTERN =
  /^(VR-PCL-\d{8}-[A-HJ-NP-Z2-9]{8}|VRP-\d{8}-[A-Z0-9]{8})$/;

export function isParcelCode(code: string): boolean {
  return PARCEL_CODE_PATTERN.test(code.trim());
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
      return { label: status ?? "Không rõ", tone: "neutral" };
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
  | "resend-email";

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
