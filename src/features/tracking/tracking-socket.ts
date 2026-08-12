import { io, type Socket } from "socket.io-client";

import { API_BASE_URL, refreshTokens } from "@/api/client";
import type {
  BookingCreatedEvent,
  BookingUpdatedEvent,
  EtaBatchUpdateEvent,
  EtaUpdateEvent,
  GpsUpdatePayload,
  ShuttleEtaUpdateEvent,
  ShuttleGpsUpdatePayload,
  TripRouteDeviationEvent,
  TripRouteGeometryData,
  TripStatusChangedEvent,
} from "@/api/types";

// Socket.IO của Tracking dùng path riêng /tracking/socket.io (không qua Gateway
// route table; Nginx proxy thẳng tới tracking service). Auth bằng access token raw
// (KHÔNG kèm "Bearer") theo doc.
export function createTrackingSocket(accessToken: string): Socket {
  const socket = io(API_BASE_URL, {
    path: "/tracking/socket.io",
    auth: { token: accessToken },
    transports: ["websocket"],
    // Tự kết nối lại khi rớt mạng ngắn; foreground nên giữ số lần thử vừa phải.
    reconnectionAttempts: 5,
    autoConnect: true,
  });

  // Token chỉ được verify lúc handshake (API-ETA-Tracking.md) mà TTL chỉ 900s
  // → chuyến chạy quá 15 phút rồi rớt mạng thì reconnect chắc chắn mang token
  // hết hạn, 5 lần thử đều UNAUTHORIZED và GPS chết lặng lẽ. Refresh đúng MỘT
  // lần cho mỗi phiên kết nối rồi nối lại với token mới; connect thành công
  // reset quota để lần hết hạn sau (15 phút nữa) vẫn tự cứu được.
  let authRetried = false;
  socket.on("connect", () => {
    authRetried = false;
  });
  socket.on("connect_error", (error) => {
    if (error?.message !== "UNAUTHORIZED" || authRetried) {
      return;
    }
    authRetried = true;
    void refreshTokens()
      .then((data) => {
        // socket.active = false nghĩa là đã bị disconnect() chủ động (unmount)
        // trong lúc chờ refresh — không hồi sinh kết nối đã dọn.
        if (data && socket.active) {
          socket.auth = { token: data.accessToken };
          socket.connect();
        }
      })
      .catch(() => {
        // Refresh lỗi mạng — để nhịp reconnect thường của socket tự thử tiếp.
      });
  });

  return socket;
}

type JoinAck =
  | {
      success: true;
      tripId: string;
      room: string;
      scope: string;
      // Chỉ có khi join với includeRouteSnapshot: true.
      routeContext?: TripRouteGeometryData | null;
      routeVersion?: string;
    }
  | { success: false; error: string; message?: string };

export type JoinTripResult = {
  scope: string;
  routeContext?: TripRouteGeometryData | null;
  routeVersion?: string;
};

// Join room tracking của trip. Trả scope (+ route snapshot nếu yêu cầu),
// throw nếu bị từ chối.
// includeRouteSnapshot: server trả luôn routeContext + routeVersion (ETag)
// trong ack — snapshot tại thời điểm join, dùng thay REST route-geometry để
// map luôn mới sau reconnect/đổi tuyến (checklist API-ETA-Tracking.md).
export async function joinTripTracking(
  socket: Socket,
  tripId: string,
  options?: { includeRouteSnapshot?: boolean },
): Promise<JoinTripResult> {
  const includeRouteSnapshot = options?.includeRouteSnapshot === true;
  const ack = (await socket.timeout(5000).emitWithAck("joinTripTracking", {
    tripId,
    ...(includeRouteSnapshot ? { includeRouteSnapshot: true } : {}),
  })) as JoinAck;

  if (!ack?.success) {
    // Snapshot lỗi thì server KHÔNG join room (doc) — nhưng GPS/broadcast quan
    // trọng hơn map: thử lại một lần không kèm snapshot thay vì chịu thua.
    if (
      includeRouteSnapshot &&
      ack?.error === "TRACKING_ROUTE_CONTEXT_UNAVAILABLE"
    ) {
      return joinTripTracking(socket, tripId);
    }
    throw new Error(ack?.error ?? "JOIN_FAILED");
  }

  return {
    scope: ack.scope,
    routeContext: ack.routeContext,
    routeVersion: ack.routeVersion,
  };
}

type GpsAck = { success: boolean; error?: string; message?: string };

// Gửi 1 điểm GPS. Trả về true nếu server ack thành công.
export async function sendGpsUpdate(
  socket: Socket,
  payload: GpsUpdatePayload,
): Promise<boolean> {
  const ack = (await socket
    .timeout(5000)
    .emitWithAck("gps:update", payload)) as GpsAck;

  return ack?.success === true;
}

// Server broadcast ETA mới vào room trip:<tripId> sau khi tính lại (không phải
// mỗi điểm GPS đều có — có throttle/cooldown phía backend).
export function onEtaUpdate(
  socket: Socket,
  handler: (event: EtaUpdateEvent) => void,
): () => void {
  socket.on("eta:update", handler);
  return () => {
    socket.off("eta:update", handler);
  };
}

// Server broadcast ETA của TOÀN BỘ target còn lại (stops + bến đích) sau mỗi
// lần tính lại. Batch thay thế hoàn toàn batch trước — target không còn trong
// batch mới thì ETA cũ của nó không còn hiệu lực.
export function onEtaBatchUpdate(
  socket: Socket,
  handler: (event: EtaBatchUpdateEvent) => void,
): () => void {
  socket.on("eta:batch:update", handler);
  return () => {
    socket.off("eta:batch:update", handler);
  };
}

// Server broadcast khi delay detection đánh dấu chuyến trễ.
export function onTripStatusChanged(
  socket: Socket,
  handler: (event: TripStatusChangedEvent) => void,
): () => void {
  socket.on("trip:statusChanged", handler);
  return () => {
    socket.off("trip:statusChanged", handler);
  };
}

// Server broadcast khi xe lệch khỏi polyline tuyến (BE tính; app chỉ hiển thị).
// BE ĐÃ triển khai (FE-RESPONSE-route-deviation.md 2026-08-12, branch
// feat/route-deviation): chỉ phát vào crew room trip:crew:<tripId> — join
// bằng joinTripTracking với scope DRIVER/ASSISTANT là BE tự thêm vào room.
export function onRouteDeviation(
  socket: Socket,
  handler: (event: TripRouteDeviationEvent) => void,
): () => void {
  socket.on("trip:routeDeviation", handler);
  return () => {
    socket.off("trip:routeDeviation", handler);
  };
}

// ===== Shuttle (Day 36) + crew realtime (API-Driver-Assistant.md) =====

// Join room tracking của ShuttleTrip. Ack của server đặt tên field là `tripId`
// nhưng giá trị là shuttleTripId — chỉ đọc scope, không dùng field đó.
export async function joinShuttleTracking(
  socket: Socket,
  shuttleTripId: string,
): Promise<string> {
  const ack = (await socket
    .timeout(5000)
    .emitWithAck("joinShuttleTracking", { shuttleTripId })) as JoinAck;

  if (!ack?.success) {
    throw new Error(ack?.error ?? "JOIN_FAILED");
  }

  return ack.scope;
}

// Gửi 1 điểm GPS shuttle. Payload dùng `heading` (KHÔNG phải headingDeg).
export async function sendShuttleGpsUpdate(
  socket: Socket,
  payload: ShuttleGpsUpdatePayload,
): Promise<boolean> {
  const ack = (await socket
    .timeout(5000)
    .emitWithAck("shuttle:gps:update", payload)) as GpsAck;

  return ack?.success === true;
}

// Server broadcast ETA tới điểm đón kế tiếp (backend chỉ tính lại khi xe đi
// đủ 500m hoặc ETA trước < 15 phút — không phải mỗi điểm GPS đều có).
export function onShuttleEtaUpdate(
  socket: Socket,
  handler: (event: ShuttleEtaUpdateEvent) => void,
): () => void {
  socket.on("shuttle:eta:update", handler);
  return () => {
    socket.off("shuttle:eta:update", handler);
  };
}

// Server broadcast booking mới CONFIRMED vào crew room (chỉ Driver/Assistant
// của Trip nhận — Tracking tự thêm vào room sau joinTripTracking).
export function onBookingCreated(
  socket: Socket,
  handler: (event: BookingCreatedEvent) => void,
): () => void {
  socket.on("booking:created", handler);
  return () => {
    socket.off("booking:created", handler);
  };
}

// Server broadcast mọi biến động booking của Trip vào crew room (tạo/hủy/
// boarded/transfer). Chỉ là tín hiệu — client dedupe eventId rồi refetch
// manifest/seat-map REST; booking:created cũ vẫn được BE giữ để tương thích.
export function onBookingUpdated(
  socket: Socket,
  handler: (event: BookingUpdatedEvent) => void,
): () => void {
  socket.on("booking:updated", handler);
  return () => {
    socket.off("booking:updated", handler);
  };
}
