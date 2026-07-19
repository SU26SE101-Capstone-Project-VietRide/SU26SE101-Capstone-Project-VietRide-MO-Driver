import type { Tone } from "@/features/operations/mock-data";

// Backend trả status parcel dạng string (18 giá trị) → map defensive, có fallback.
export function parcelStatusMeta(status: string | null | undefined): {
  label: string;
  tone: Tone;
} {
  switch (status) {
    case "PENDING_OPERATOR_REVIEW":
      return { label: "Chờ duyệt", tone: "info" };
    case "PENDING_PAYMENT":
      return { label: "Chờ thanh toán", tone: "warning" };
    case "PENDING":
      return { label: "Chờ xử lý", tone: "neutral" };
    case "PENDING_ADDITIONAL_PAYMENT":
      return { label: "Chờ phụ phí", tone: "warning" };
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
export type ParcelAction = "reweigh" | "unload" | "confirm-delivery";

export function allowedParcelActions(
  status: string | null | undefined,
): ParcelAction[] {
  switch (status) {
    case "PENDING":
    case "PENDING_ADDITIONAL_PAYMENT":
      return ["reweigh"];
    case "LOADED":
      return ["reweigh", "unload"];
    case "IN_TRANSIT":
      return ["unload"];
    case "UNLOADED":
    case "DELIVERED_PENDING_CONFIRM":
      return ["confirm-delivery"];
    default:
      return [];
  }
}
