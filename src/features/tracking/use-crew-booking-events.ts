import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

import { getTokens } from "@/api/token-storage";
import type { BookingCreatedEvent, BookingUpdatedEvent } from "@/api/types";

import {
  createTrackingSocket,
  joinTripTracking,
  onBookingCreated,
  onBookingUpdated,
} from "./tracking-socket";
import { TRACKING_ENABLED } from "./use-gps-broadcast";

// Nghe biến động booking của chuyến qua crew room — KHÔNG phát GPS, không xin
// quyền vị trí. Dành cho màn không phải màn điều hành chuyến (vd Đón khách của
// phụ xe): useGpsBroadcast chỉ mount ở màn Chuyến (driver) nên phụ xe đứng màn
// Đón khách sẽ không có socket nếu thiếu hook này — realtime khi đó chỉ còn
// poll 25s của useManifest (FE-REQUEST-realtime-booking-notify-RESPONSE.md §2).
// Socket/FCM chỉ là tín hiệu: hook invalidate để manifest/seat-map REST refetch,
// đồng thời trả event mới nhất cho banner UI.
export function useCrewBookingEvents(tripId: string | null) {
  // Booking mới nhất qua booking:created (payload giàu: bookingCode, số khách).
  const [bookingEvent, setBookingEvent] = useState<BookingCreatedEvent | null>(
    null,
  );
  // Biến động gần nhất qua booking:updated (hủy/boarded/transfer).
  const [bookingUpdate, setBookingUpdate] = useState<BookingUpdatedEvent | null>(
    null,
  );
  // Dedupe theo eventId (RabbitMQ at-least-once). Hai set RIÊNG vì cùng một
  // biến động có thể tới qua cả booking:created (legacy) lẫn booking:updated
  // với trùng eventId — dùng chung set sẽ nuốt event tới sau của kênh còn lại.
  const seenCreatedIdsRef = useRef<Set<string>>(new Set());
  const seenUpdatedIdsRef = useRef<Set<string>>(new Set());
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!TRACKING_ENABLED || !tripId) {
      return;
    }

    let cancelled = false;
    let socket: Socket | null = null;
    let unsubscribe: (() => void) | null = null;
    // Chỉ invalidate khi RE-connect (lần connect đầu thì query vừa fetch xong,
    // refetch thêm là thừa). Doc §3: sau reconnect phải đọc lại manifest vì
    // event trong lúc rớt mạng đã mất.
    let hasConnectedOnce = false;

    const invalidateTripData = () => {
      void queryClient.invalidateQueries({ queryKey: ["manifest", tripId] });
      void queryClient.invalidateQueries({ queryKey: ["seat-map", tripId] });
      void queryClient.invalidateQueries({ queryKey: ["trip", tripId] });
    };

    const start = async () => {
      const tokens = await getTokens();
      if (cancelled || !tokens) {
        return;
      }

      const activeSocket = createTrackingSocket(tokens.accessToken);
      socket = activeSocket;

      // Đăng ký listener ngay từ đầu để không lỡ event bắn ra sát lúc join xong.
      const offCreated = onBookingCreated(activeSocket, (event) => {
        if (event?.tripId !== tripId || cancelled) {
          return;
        }
        if (seenCreatedIdsRef.current.has(event.eventId)) {
          return;
        }
        seenCreatedIdsRef.current.add(event.eventId);
        setBookingEvent(event);
        invalidateTripData();
      });

      const offUpdated = onBookingUpdated(activeSocket, (event) => {
        if (event?.tripId !== tripId || cancelled) {
          return;
        }
        if (seenUpdatedIdsRef.current.has(event.eventId)) {
          return;
        }
        seenUpdatedIdsRef.current.add(event.eventId);
        setBookingUpdate(event);
        invalidateTripData();
        // Transfer đổi ghế/khách ở CẢ trip cũ và mới — invalidate luôn hai bên
        // (nếu cache đang giữ) vì event chỉ tới room mình đã join.
        if (event.reason === "BOOKING_TRANSFERRED") {
          for (const otherId of [event.oldTripId, event.newTripId]) {
            if (otherId && otherId !== tripId) {
              void queryClient.invalidateQueries({
                queryKey: ["manifest", otherId],
              });
              void queryClient.invalidateQueries({
                queryKey: ["seat-map", otherId],
              });
              void queryClient.invalidateQueries({ queryKey: ["trip", otherId] });
            }
          }
        }
      });

      unsubscribe = () => {
        offCreated();
        offUpdated();
      };

      // Reconnect chạy lại handler này — join lại room mới nhận tiếp event.
      activeSocket.on("connect", () => {
        joinTripTracking(activeSocket, tripId)
          .then(() => {
            if (cancelled) {
              return;
            }
            if (hasConnectedOnce) {
              invalidateTripData();
            }
            hasConnectedOnce = true;
          })
          .catch(() => {
            // Join bị từ chối (sai scope/chuyến không tồn tại) — bỏ qua,
            // poll 25s của useManifest vẫn là lưới an toàn.
          });
      });
    };

    void start();

    return () => {
      cancelled = true;
      unsubscribe?.();
      socket?.disconnect();
    };
  }, [tripId, queryClient]);

  // Lọc theo tripId hiện tại thay vì reset state khi đổi chuyến — tránh
  // setState trong thân effect, event của chuyến cũ tự hết hiệu lực.
  return {
    bookingEvent: bookingEvent?.tripId === tripId ? bookingEvent : null,
    bookingUpdate: bookingUpdate?.tripId === tripId ? bookingUpdate : null,
  };
}
