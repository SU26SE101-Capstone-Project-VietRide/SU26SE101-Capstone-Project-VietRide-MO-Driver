import { io, type Socket } from "socket.io-client";

import { API_BASE_URL } from "@/api/client";
import type {
  BookingCreatedEvent,
  EtaUpdateEvent,
  GpsUpdatePayload,
  ShuttleEtaUpdateEvent,
  ShuttleGpsUpdatePayload,
  TripStatusChangedEvent,
} from "@/api/types";

// Socket.IO của Tracking dùng path riêng /tracking/socket.io (không qua Gateway
// route table; Nginx proxy thẳng tới tracking service). Auth bằng access token raw
// (KHÔNG kèm "Bearer") theo doc.
export function createTrackingSocket(accessToken: string): Socket {
  return io(API_BASE_URL, {
    path: "/tracking/socket.io",
    auth: { token: accessToken },
    transports: ["websocket"],
    // Tự kết nối lại khi rớt mạng ngắn; foreground nên giữ số lần thử vừa phải.
    reconnectionAttempts: 5,
    autoConnect: true,
  });
}

type JoinAck =
  | { success: true; tripId: string; room: string; scope: string }
  | { success: false; error: string; message?: string };

// Join room tracking của trip. Trả scope nếu thành công, throw nếu bị từ chối.
export async function joinTripTracking(
  socket: Socket,
  tripId: string,
): Promise<string> {
  const ack = (await socket
    .timeout(5000)
    .emitWithAck("joinTripTracking", { tripId })) as JoinAck;

  if (!ack?.success) {
    throw new Error(ack?.error ?? "JOIN_FAILED");
  }

  return ack.scope;
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
