import type { Href } from "expo-router";

import type { NotificationAction } from "@/api/types";
import type { CrewRole } from "@/features/operations/mock-data";

// Contract Phase 11 (docs/Implements/FE-REQUEST-notification-phase11-RESPONSE.md):
// mỗi notification luôn có action.type + action.params. FE KHÔNG suy luận điều
// hướng từ notification.type nữa khi BE đã trả action.

const ACTION_TYPES = [
  "OPEN_BOOKING_DETAIL",
  "OPEN_CREW_TRIP_BOOKING",
  "OPEN_TRIP_DETAIL",
  "OPEN_TRIP_TRACKING",
  "OPEN_PARCEL_DETAIL",
  "OPEN_WALLET",
  "OPEN_SUBSCRIPTION",
  "OPEN_SHUTTLE_TRACKING",
  "NONE",
] as const;

export const NO_ACTION: NotificationAction = { type: "NONE", params: {} };

function isActionType(value: unknown): value is NotificationAction["type"] {
  return (
    typeof value === "string" &&
    (ACTION_TYPES as readonly string[]).includes(value)
  );
}

function stringParam(
  params: Record<string, unknown>,
  key: string,
): string | null {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

// Chuẩn hoá action từ REST. BE có thể chưa deploy Phase 11 hoặc trả params rỗng
// → luôn quy về NONE thay vì để undefined lọt xuống UI.
export function parseNotificationAction(raw: unknown): NotificationAction {
  if (!raw || typeof raw !== "object") {
    return NO_ACTION;
  }

  const candidate = raw as { type?: unknown; params?: unknown };
  if (!isActionType(candidate.type)) {
    return NO_ACTION;
  }

  const params =
    candidate.params && typeof candidate.params === "object"
      ? (candidate.params as Record<string, unknown>)
      : {};

  return { type: candidate.type, params } as NotificationAction;
}

// FCM: mọi data field đều là string, actionParams là JSON string. Parse lỗi →
// NONE (§5 của doc BE) chứ không throw trong listener push.
export function actionFromPushData(
  data: Record<string, unknown>,
): NotificationAction {
  if (!isActionType(data.actionType)) {
    return legacyActionFromPushData(data);
  }

  let params: Record<string, unknown> = {};
  const rawParams = data.actionParams;
  if (typeof rawParams === "string" && rawParams.length > 0) {
    try {
      const parsed: unknown = JSON.parse(rawParams);
      if (parsed && typeof parsed === "object") {
        params = parsed as Record<string, unknown>;
      }
    } catch {
      return NO_ACTION;
    }
  } else if (rawParams && typeof rawParams === "object") {
    // Một số SDK tự parse object lồng trước khi tới listener.
    params = rawParams as Record<string, unknown>;
  }

  return { type: data.actionType, params } as NotificationAction;
}

// Fallback cho build mobile cũ / push phát trước Phase 11: suy ra action từ
// data.type + các id legacy. Xoá được khi BE tắt hẳn payload legacy.
function legacyActionFromPushData(
  data: Record<string, unknown>,
): NotificationAction {
  const type = typeof data.type === "string" ? data.type : "";
  const shuttleTripId = stringParam(data, "shuttleTripId");
  const tripId = stringParam(data, "tripId");
  const bookingId = stringParam(data, "bookingId");
  const parcelId = stringParam(data, "parcelId");

  if (type === "SHUTTLE_ASSIGNED" && shuttleTripId) {
    return { type: "OPEN_SHUTTLE_TRACKING", params: { shuttleTripId } };
  }

  if (
    type === "BOOKING_CREATED" ||
    type === "BOOKING_CANCELLED" ||
    type === "PASSENGER_BOARDED" ||
    type === "BOOKING_TRANSFERRED"
  ) {
    if (tripId && bookingId) {
      return { type: "OPEN_CREW_TRIP_BOOKING", params: { tripId, bookingId } };
    }
    if (tripId) {
      return { type: "OPEN_TRIP_DETAIL", params: { tripId } };
    }
  }

  if (type === "PARCEL_UPDATE" && parcelId) {
    return { type: "OPEN_PARCEL_DETAIL", params: { parcelId } };
  }

  if ((type === "TRIP_ASSIGNED" || type === "TRIP_UPDATE") && tripId) {
    return { type: "OPEN_TRIP_DETAIL", params: { tripId } };
  }

  return NO_ACTION;
}

// Map action nghiệp vụ → route thật của app crew này. App chỉ có DRIVER và
// ASSISTANT nên các action dành cho passenger (ví/subscription) không có màn
// đích → trả null = ở lại chỗ cũ.
//
// Mọi action có tripId đều đi tới /trips/{tripId}: tab "Chuyến"/"Đón khách"
// khóa cứng vào chuyến đang chạy nên nếu đẩy vào đó, thông báo của chuyến khác
// sẽ mở nhầm sang chuyến hiện tại mà không báo gì.
export function resolveActionHref(
  action: NotificationAction,
  role: CrewRole | null,
): Href | null {
  if (!role) {
    return null;
  }

  switch (action.type) {
    case "OPEN_CREW_TRIP_BOOKING":
    case "OPEN_TRIP_DETAIL":
    case "OPEN_TRIP_TRACKING": {
      const tripId = stringParam(action.params, "tripId");
      return tripId ? (`/trips/${tripId}` as Href) : null;
    }

    // App crew không có màn chi tiết vé của khách, và action này không kèm
    // tripId để suy ra chuyến → mở nhầm còn tệ hơn là đứng yên.
    case "OPEN_BOOKING_DETAIL":
      return null;

    // Phụ xe về màn hàng hóa. Tài xế không có màn kiện hàng, nhưng thông báo
    // kèm parcelId với tài xế nghĩa là có phiếu sự cố chờ duyệt — backend chưa
    // có endpoint danh sách phiếu chờ (Guide (2) §22 gap 1) nên ĐÂY là đường
    // duy nhất tài xế mở được phiếu.
    case "OPEN_PARCEL_DETAIL": {
      if (role === "ASSISTANT") {
        return "/assistant/cargo";
      }
      const parcelId = stringParam(action.params, "parcelId");
      return parcelId
        ? (`/driver/parcel-approval?parcelId=${parcelId}` as Href)
        : null;
    }

    case "OPEN_SHUTTLE_TRACKING": {
      const shuttleTripId = stringParam(action.params, "shuttleTripId");
      if (role !== "DRIVER" || !shuttleTripId) {
        return null;
      }
      return `/driver/shuttle/${shuttleTripId}` as Href;
    }

    // Ví và gói đăng ký là màn của app hành khách, app crew không có.
    case "OPEN_WALLET":
    case "OPEN_SUBSCRIPTION":
    case "NONE":
      return null;
  }
}

// Các query cần refetch sau khi nhận notification. REST vẫn là source of truth,
// push/inbox chỉ là tín hiệu.
export function invalidationKeysForAction(
  action: NotificationAction,
): unknown[][] {
  const keys: unknown[][] = [];
  const tripId = stringParam(action.params, "tripId");

  if (tripId) {
    keys.push(["manifest", tripId], ["seat-map", tripId], ["trip", tripId]);
    // Đổi tuyến (TRIP_UPDATE + notificationType=TRIP_ROUTE_CHANGED) đổi cả
    // polyline — bản đồ/FAKE_GPS không được giữ đường cũ. FCM data không cần
    // branch theo notificationType: mọi biến động trip đều nên làm mới geometry,
    // query chỉ refetch khi màn liên quan đang mở nên chi phí không đáng kể.
    keys.push(["trip-route-geometry", tripId]);
  }

  if (action.type === "OPEN_SHUTTLE_TRACKING") {
    keys.push(["shuttle-trips"]);
  }

  if (action.type === "OPEN_PARCEL_DETAIL") {
    keys.push(["parcels"]);
  }

  return keys;
}
