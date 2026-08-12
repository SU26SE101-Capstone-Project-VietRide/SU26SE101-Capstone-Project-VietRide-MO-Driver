import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";

import { getTokens } from "@/api/token-storage";
import type { TripRouteDeviationEvent } from "@/api/types";

import {
  createTrackingSocket,
  joinTripTracking,
  onRouteDeviation,
} from "./tracking-socket";
import {
  DEVIATION_AUTO_CLEAR_MS,
  TRACKING_ENABLED,
} from "./use-gps-broadcast";

// Nghe cảnh báo lệch tuyến của chuyến — KHÔNG phát GPS, không xin quyền vị trí.
// Dành cho màn theo dõi hành trình fullscreen (useGpsBroadcast chỉ mount ở màn
// Chuyến nên màn này cần socket listen-only riêng, giống use-crew-booking-events).
export function useRouteDeviation(
  tripId: string | null,
): TripRouteDeviationEvent | null {
  const [deviation, setDeviation] = useState<TripRouteDeviationEvent | null>(
    null,
  );

  useEffect(() => {
    if (!TRACKING_ENABLED || !tripId) {
      return;
    }

    let cancelled = false;
    let socket: Socket | null = null;
    let unsubscribe: (() => void) | null = null;

    const start = async () => {
      const tokens = await getTokens();
      if (cancelled || !tokens) {
        return;
      }

      const activeSocket = createTrackingSocket(tokens.accessToken);
      socket = activeSocket;

      // Đăng ký listener ngay từ đầu để không lỡ event bắn ra sát lúc join xong.
      unsubscribe = onRouteDeviation(activeSocket, (event) => {
        if (event?.tripId !== tripId || cancelled) {
          return;
        }
        // ROUTE_RESTORED = đã về lại tuyến → tắt cảnh báo; heartbeat DEVIATED
        // (>= 60s/lần khi còn lệch) refresh cả distanceMeters lẫn timeout.
        if (event.status === "ROUTE_RESTORED") {
          setDeviation(null);
        } else if (event.status === "DEVIATED") {
          setDeviation(event);
        }
        // Status lạ trong tương lai: bỏ qua an toàn (khuyến nghị của BE).
      });

      // Reconnect chạy lại handler này — join lại room mới nhận tiếp event.
      activeSocket.on("connect", () => {
        joinTripTracking(activeSocket, tripId).catch(() => {
          // Join bị từ chối (sai scope/chuyến không tồn tại) — bỏ qua,
          // màn map vẫn dùng được, chỉ không có cảnh báo lệch.
        });
      });
    };

    void start();

    return () => {
      cancelled = true;
      unsubscribe?.();
      socket?.disconnect();
    };
  }, [tripId]);

  // Lưới an toàn tự ẩn sau 5 phút kể từ event gần nhất.
  useEffect(() => {
    if (!deviation) {
      return;
    }
    const timer = setTimeout(() => setDeviation(null), DEVIATION_AUTO_CLEAR_MS);
    return () => clearTimeout(timer);
  }, [deviation]);

  // Lọc theo tripId hiện tại — event của chuyến cũ tự hết hiệu lực khi đổi chuyến.
  return deviation?.tripId === tripId ? deviation : null;
}
