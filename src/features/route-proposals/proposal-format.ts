import type {
  RouteChangeProposalResolutionCode,
  RouteChangeProposalStatus,
} from "@/api/types";
import type { Tone } from "@/features/operations/mock-data";

// Đủ cả 5 trạng thái backend có thể trả (doc mục 5.1) — thiếu một cái là màn
// hình hiện chuỗi tiếng Anh trần.
const STATUS_META: Record<
  RouteChangeProposalStatus,
  { label: string; tone: Tone }
> = {
  PENDING: { label: "Chờ duyệt", tone: "warning" },
  APPROVED: { label: "Đã duyệt", tone: "success" },
  REJECTED: { label: "Bị từ chối", tone: "danger" },
  SUPERSEDED: { label: "Đã bị thay thế", tone: "neutral" },
  EXPIRED: { label: "Hết hiệu lực", tone: "neutral" },
};

export function proposalStatusMeta(status: RouteChangeProposalStatus): {
  label: string;
  tone: Tone;
} {
  const meta = STATUS_META[status];
  if (meta) {
    return meta;
  }
  // Enum lạ chỉ log ở dev — không đẩy chuỗi tiếng Anh của backend ra UI.
  if (__DEV__ && status) {
    console.warn(
      `[proposal-format] chưa có label tiếng Việt cho trạng thái đề xuất: ${status}`,
    );
  }
  return { label: "Không rõ trạng thái", tone: "neutral" };
}

// Vì sao đề xuất bị hệ thống chốt thay vì admin bấm từ chối.
const RESOLUTION_TEXT: Record<RouteChangeProposalResolutionCode, string> = {
  ANOTHER_PROPOSAL_APPROVED:
    "Điều hành đã duyệt một đề xuất khác của chuyến này.",
  ROUTE_CHANGED_DIRECTLY: "Điều hành đã tự đổi tuyến cho chuyến.",
  TRIP_NO_LONGER_EDITABLE: "Chuyến đã kết thúc nên đề xuất không còn hiệu lực.",
  SOURCE_ROUTE_CHANGED:
    "Tuyến thay thế được chọn đã thay đổi hoặc ngừng sử dụng.",
};

export function resolutionCodeText(
  code: RouteChangeProposalResolutionCode | null,
): string | null {
  if (!code) {
    return null;
  }
  return RESOLUTION_TEXT[code] ?? null;
}

// Backend trả decimal dạng number và cho phép null.
export function formatDistanceKm(km: number | null): string {
  if (km == null) {
    return "—";
  }
  // Bỏ phần thập phân thừa: 125.50 → "125,5 km", 120.00 → "120 km".
  const rounded = Math.round(km * 10) / 10;
  return `${String(rounded).replace(".", ",")} km`;
}

export function formatDurationMinutes(minutes: number | null): string {
  if (minutes == null) {
    return "—";
  }
  if (minutes < 60) {
    return `${minutes} phút`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} giờ` : `${hours} giờ ${rest} phút`;
}
