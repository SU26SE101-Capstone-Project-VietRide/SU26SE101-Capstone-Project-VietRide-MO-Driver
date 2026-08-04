import { io, type Socket } from "socket.io-client";

import { API_BASE_URL } from "@/api/client";
import type {
  EtaUpdateEvent,
  GpsUpdatePayload,
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
