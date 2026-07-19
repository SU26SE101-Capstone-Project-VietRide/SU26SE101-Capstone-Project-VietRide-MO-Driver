import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

import { getTokens } from "@/api/token-storage";
import type { GpsUpdatePayload } from "@/api/types";

import {
  createTrackingSocket,
  joinTripTracking,
  sendGpsUpdate,
} from "./tracking-socket";

// Trạng thái luồng phát GPS foreground cho màn chuyến đang chạy.
export type GpsBroadcastStatus =
  | "idle" // chưa bật
  | "requesting-permission" // đang xin quyền vị trí
  | "denied" // user từ chối quyền
  | "connecting" // đang kết nối socket / join room
  | "tracking" // đang phát GPS
  | "error"; // lỗi kết nối / bị từ chối scope

// Tần suất lấy vị trí: 5s hoặc khi di chuyển >= 15m.
const GPS_TIME_INTERVAL_MS = 5000;
const GPS_DISTANCE_INTERVAL_M = 15;

// Cờ bật kết nối Socket.IO tracking. MẶC ĐỊNH TẮT vì endpoint
// /tracking/socket.io trên production chưa được hạ tầng deploy (BE xác nhận
// 2026-07-10). Bật bằng EXPO_PUBLIC_TRACKING_ENABLED=true khi BE sẵn sàng.
export const TRACKING_ENABLED =
  process.env.EXPO_PUBLIC_TRACKING_ENABLED === "true";

// Chuyển LocationObject của expo-location sang payload gps:update.
// speed của expo-location là m/s → đổi ra km/h; heading = -1 nghĩa là không có.
function toGpsPayload(
  tripId: string,
  location: Location.LocationObject,
): GpsUpdatePayload {
  const { coords, timestamp } = location;
  const payload: GpsUpdatePayload = {
    tripId,
    latitude: coords.latitude,
    longitude: coords.longitude,
    recordedAt: new Date(timestamp).toISOString(),
  };

  if (coords.speed != null && coords.speed >= 0) {
    payload.speedKmh = coords.speed * 3.6;
  }

  if (coords.heading != null && coords.heading >= 0) {
    payload.headingDeg = coords.heading;
  }

  return payload;
}

// Phát GPS realtime khi tài xế/phụ xe đang mở màn chuyến (foreground).
// enabled=false hoặc tripId=null thì dừng và dọn dẹp.
export function useGpsBroadcast(tripId: string | null, enabled: boolean) {
  const [status, setStatus] = useState<GpsBroadcastStatus>("idle");
  const socketRef = useRef<Socket | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const cleanup = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
    socketRef.current?.disconnect();
    socketRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      // Chưa bật tính năng (production socket chưa sẵn sàng) hoặc không đủ điều kiện.
      if (!TRACKING_ENABLED || !enabled || !tripId) {
        cleanup();
        if (!cancelled) {
          setStatus("idle");
        }
        return;
      }

      setStatus("requesting-permission");
      const permission = await Location.requestForegroundPermissionsAsync();

      if (cancelled) {
        return;
      }

      if (!permission.granted) {
        setStatus("denied");
        return;
      }

      const tokens = await getTokens();
      if (cancelled || !tokens) {
        if (!cancelled) {
          setStatus("error");
        }
        return;
      }

      setStatus("connecting");
      const socket = createTrackingSocket(tokens.accessToken);
      socketRef.current = socket;

      socket.on("connect_error", () => {
        if (!cancelled) {
          setStatus("error");
        }
      });

      socket.on("connect", () => {
        // Join room rồi mới bắt đầu watch vị trí.
        joinTripTracking(socket, tripId)
          .then(async () => {
            if (cancelled) {
              return;
            }

            watchRef.current = await Location.watchPositionAsync(
              {
                accuracy: Location.Accuracy.High,
                timeInterval: GPS_TIME_INTERVAL_MS,
                distanceInterval: GPS_DISTANCE_INTERVAL_M,
              },
              (location) => {
                // Fire-and-forget từng điểm; lỗi ack chỉ chuyển trạng thái, không throw.
                void sendGpsUpdate(
                  socket,
                  toGpsPayload(tripId, location),
                ).catch(() => {
                  /* bỏ qua lỗi 1 điểm, tiếp tục phát điểm sau */
                });
              },
            );

            if (cancelled) {
              // Nếu bị hủy ngay sau khi tạo watch, dọn luôn.
              watchRef.current?.remove();
              watchRef.current = null;
              return;
            }

            setStatus("tracking");
          })
          .catch(() => {
            if (!cancelled) {
              setStatus("error");
            }
          });
      });
    };

    void start();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [tripId, enabled, cleanup]);

  return { status };
}
