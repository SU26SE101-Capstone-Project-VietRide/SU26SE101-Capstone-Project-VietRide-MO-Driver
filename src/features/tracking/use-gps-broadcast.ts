import { useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

import { getTokens } from "@/api/token-storage";
import type {
  BookingCreatedEvent,
  BookingUpdatedEvent,
  EtaBatchUpdateEvent,
  EtaUpdateEvent,
  GeoPoint,
  GpsUpdatePayload,
  ShuttleEtaUpdateEvent,
  ShuttleGpsUpdatePayload,
  TripEtaData,
  TripStatusChangedEvent,
} from "@/api/types";

import {
  FAKE_GPS_ENABLED,
  fakeGpsSpeedKmh,
  positionAlongPath,
} from "./fake-gps-route";
import {
  createTrackingSocket,
  joinShuttleTracking,
  joinTripTracking,
  onBookingCreated,
  onBookingUpdated,
  onEtaBatchUpdate,
  onEtaUpdate,
  onShuttleEtaUpdate,
  onTripStatusChanged,
  sendGpsUpdate,
  sendShuttleGpsUpdate,
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

// Đích phát GPS: chuyến chính hoặc shuttle. Hai contract khác event + tên field
// (tripId/headingDeg vs shuttleTripId/heading) nên phân nhánh theo kind.
export type GpsTarget = { kind: "trip" | "shuttle"; id: string };

// Chuyển LocationObject của expo-location sang payload gps:update.
// speed của expo-location là m/s → đổi ra km/h; heading = -1 nghĩa là không có.
function toTripGpsPayload(
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

// Shuttle dùng field `heading` (contract Day 36), còn lại giống chuyến chính.
function toShuttleGpsPayload(
  shuttleTripId: string,
  location: Location.LocationObject,
): ShuttleGpsUpdatePayload {
  const { coords, timestamp } = location;
  const payload: ShuttleGpsUpdatePayload = {
    shuttleTripId,
    latitude: coords.latitude,
    longitude: coords.longitude,
    recordedAt: new Date(timestamp).toISOString(),
  };

  if (coords.speed != null && coords.speed >= 0) {
    payload.speedKmh = coords.speed * 3.6;
  }

  if (coords.heading != null && coords.heading >= 0) {
    payload.heading = coords.heading;
  }

  return payload;
}

// Phát GPS realtime khi tài xế/phụ xe đang mở màn chuyến (foreground), đồng
// thời nghe ETA và cảnh báo trễ mà server broadcast vào cùng room.
// enabled=false hoặc target=null thì dừng và dọn dẹp.
// `simulationPath` chỉ dùng khi bật cờ demo EXPO_PUBLIC_FAKE_GPS.
export function useGpsBroadcast(
  target: GpsTarget | null,
  enabled: boolean,
  simulationPath: GeoPoint[] = [],
) {
  const [status, setStatus] = useState<GpsBroadcastStatus>("idle");
  // Sự kiện trip:statusChanged gần nhất (chỉ phát khi chuyến bị đánh dấu trễ).
  const [delay, setDelay] = useState<TripStatusChangedEvent | null>(null);
  // ETA gần nhất server đẩy về. Giữ riêng vì server tự chọn stop kế tiếp theo
  // guard của nó (bỏ stop ARRIVED/SKIPPED, không lùi sequence, bỏ stop cách
  // dưới 50 m) — không chắc trùng stop mà app đoán từ danh sách điểm dừng.
  const [lastEta, setLastEta] = useState<EtaUpdateEvent | null>(null);
  // Batch ETA gần nhất (eta:batch:update) — toàn bộ stop còn lại + bến đích.
  // Mỗi batch THAY THẾ batch trước, không merge: target biến mất khỏi batch
  // nghĩa là ETA của nó hết hiệu lực (đã qua stop / cache hết hạn).
  const [etaBatch, setEtaBatch] = useState<EtaBatchUpdateEvent | null>(null);
  // ETA shuttle tới điểm đón kế tiếp (chỉ nhánh shuttle).
  const [shuttleEta, setShuttleEta] = useState<ShuttleEtaUpdateEvent | null>(
    null,
  );
  // Booking mới nhất trên chuyến (chỉ nhánh trip, crew room).
  const [bookingEvent, setBookingEvent] = useState<BookingCreatedEvent | null>(
    null,
  );
  // Biến động booking gần nhất qua booking:updated (hủy/boarded/transfer) —
  // dùng cho banner UI; dữ liệu thật luôn refetch từ REST.
  const [bookingUpdate, setBookingUpdate] = useState<BookingUpdatedEvent | null>(
    null,
  );
  // Dedupe booking:created theo eventId (RabbitMQ at-least-once).
  const seenBookingIdsRef = useRef<Set<string>>(new Set());
  // Dedupe booking:updated riêng — BE giữ booking:created để tương thích nên
  // cùng một biến động có thể tới qua cả hai event (có thể trùng eventId);
  // dùng chung set sẽ nuốt mất event tới sau của kênh còn lại.
  const seenBookingUpdateIdsRef = useRef<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const queryClient = useQueryClient();

  // Giữ đường mô phỏng trong ref để tuyến tải xong không làm effect chạy lại
  // (chạy lại = ngắt và nối lại socket giữa chừng).
  const simulationPathRef = useRef<GeoPoint[]>(simulationPath);
  useEffect(() => {
    simulationPathRef.current = simulationPath;
  }, [simulationPath]);

  const cleanup = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    socketRef.current?.disconnect();
    socketRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Destructure trước để deps của effect ổn định (object target đổi ref mỗi render).
    const kind = target?.kind ?? null;
    const id = target?.id ?? null;

    const start = async () => {
      // Chưa bật tính năng (production socket chưa sẵn sàng) hoặc không đủ điều kiện.
      if (!TRACKING_ENABLED || !enabled || !id || !kind) {
        cleanup();
        if (!cancelled) {
          setStatus("idle");
        }
        return;
      }

      // Chế độ demo không đọc GPS thiết bị nên bỏ luôn bước xin quyền vị trí.
      if (!FAKE_GPS_ENABLED) {
        setStatus("requesting-permission");
        const permission = await Location.requestForegroundPermissionsAsync();

        if (cancelled) {
          return;
        }

        if (!permission.granted) {
          setStatus("denied");
          return;
        }
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

      // Nghe broadcast của room. Đăng ký ngay từ đầu để không lỡ sự kiện bắn
      // ra sát lúc join xong.
      const unsubscribers: (() => void)[] = [];

      if (kind === "trip") {
        unsubscribers.push(
          onEtaUpdate(socket, (event) => {
            if (event?.tripId !== id) {
              return;
            }

            // Target kế tiếp có thể là bến đích (targetKind=STATION, mang
            // stationId thay vì stopId) — vẫn là ETA hợp lệ để hiển thị.
            if (!cancelled) {
              setLastEta(event);
            }

            // Chỉ ghi vào cache query theo stop khi event thực sự là stop.
            // Server tự chọn stop kế tiếp nên stopId có thể khác stop app đang
            // xem; ghi đúng theo stopId trong payload, để React Query tự khớp
            // màn hình.
            if (!event.stopId) {
              return;
            }

            queryClient.setQueryData<TripEtaData>(
              ["tracking-eta", id, event.stopId],
              {
                eta: {
                  tripId: event.tripId,
                  stopId: event.stopId,
                  etaMinutes: event.etaMinutes,
                  estimatedArrivalTime: event.estimatedArrivalTime,
                  distanceMeters: event.distanceMeters,
                  updatedAt: event.updatedAt,
                  delayed: event.delayed,
                  delayStatus: event.delayStatus,
                  delayMinutes: event.delayMinutes,
                },
              },
            );
          }),
        );

        unsubscribers.push(
          onEtaBatchUpdate(socket, (event) => {
            if (event?.tripId !== id || cancelled) {
              return;
            }
            // Replace nguyên batch — không merge với batch cũ (checklist
            // migration của API-stop-arrival-time-estimates.md).
            setEtaBatch(event);
          }),
        );

        unsubscribers.push(
          onTripStatusChanged(socket, (event) => {
            if (event?.tripId !== id || cancelled) {
              return;
            }
            // Contract mới: DELAY_CLEARED nghĩa là hết trễ → tắt cảnh báo.
            if (event.status === "DELAY_CLEARED") {
              setDelay(null);
              // DELAY_CLEARED tới mà không có eta:update mới → ETA cũ trong
              // state vẫn còn delayStatus="DELAYED" stale, phải tự hạ cờ
              // trễ trong đó, không thì banner UI dính mãi không tắt.
              setLastEta((prev) =>
                prev
                  ? { ...prev, delayed: false, delayStatus: "ON_TIME", delayMinutes: 0 }
                  : prev,
              );
            } else {
              setDelay(event);
            }
          }),
        );

        unsubscribers.push(
          onBookingCreated(socket, (event) => {
            if (event?.tripId !== id || cancelled) {
              return;
            }
            // At-least-once → bỏ qua event đã thấy.
            if (seenBookingIdsRef.current.has(event.eventId)) {
              return;
            }
            seenBookingIdsRef.current.add(event.eventId);
            setBookingEvent(event);
            // Ghế/khách của chuyến vừa đổi — làm mới từ backend.
            void queryClient.invalidateQueries({ queryKey: ["seat-map", id] });
            void queryClient.invalidateQueries({ queryKey: ["trip", id] });
            void queryClient.invalidateQueries({ queryKey: ["manifest", id] });
          }),
        );

        unsubscribers.push(
          onBookingUpdated(socket, (event) => {
            if (event?.tripId !== id || cancelled) {
              return;
            }
            if (seenBookingUpdateIdsRef.current.has(event.eventId)) {
              return;
            }
            seenBookingUpdateIdsRef.current.add(event.eventId);
            setBookingUpdate(event);
            // Tín hiệu invalidate — manifest/seat-map REST là source of truth.
            void queryClient.invalidateQueries({ queryKey: ["manifest", id] });
            void queryClient.invalidateQueries({ queryKey: ["seat-map", id] });
            void queryClient.invalidateQueries({ queryKey: ["trip", id] });
            // Transfer đổi ghế/khách ở CẢ trip cũ và mới — invalidate luôn hai
            // bên (nếu cache đang giữ) vì event chỉ tới room mình đã join.
            if (event.reason === "BOOKING_TRANSFERRED") {
              for (const otherId of [event.oldTripId, event.newTripId]) {
                if (otherId && otherId !== id) {
                  void queryClient.invalidateQueries({
                    queryKey: ["manifest", otherId],
                  });
                  void queryClient.invalidateQueries({
                    queryKey: ["seat-map", otherId],
                  });
                  void queryClient.invalidateQueries({
                    queryKey: ["trip", otherId],
                  });
                }
              }
            }
          }),
        );
      } else {
        unsubscribers.push(
          onShuttleEtaUpdate(socket, (event) => {
            if (event?.shuttleTripId !== id || cancelled) {
              return;
            }
            setShuttleEta(event);
          }),
        );
      }

      unsubscribeRef.current = () => {
        unsubscribers.forEach((off) => off());
      };

      socket.on("connect_error", () => {
        if (!cancelled) {
          setStatus("error");
        }
      });

      socket.on("connect", () => {
        // Reconnect chạy lại handler này — dọn watcher/interval cũ trước khi
        // join lại, không thì mỗi lần reconnect sẽ chồng thêm nhịp phát GPS.
        watchRef.current?.remove();
        watchRef.current = null;
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        // Join room rồi mới bắt đầu watch vị trí.
        const join =
          kind === "trip"
            ? joinTripTracking(socket, id)
            : joinShuttleTracking(socket, id);

        join
          .then(async () => {
            if (cancelled) {
              return;
            }

            if (FAKE_GPS_ENABLED) {
              // Demo: tự đi dọc tuyến thay vì đọc GPS thiết bị.
              const speedKmh = fakeGpsSpeedKmh();
              const stepMeters = (speedKmh / 3.6) * (GPS_TIME_INTERVAL_MS / 1000);
              let traveledMeters = 0;

              timerRef.current = setInterval(() => {
                const position = positionAlongPath(
                  simulationPathRef.current,
                  traveledMeters,
                );

                // Tuyến chưa tải xong thì chờ nhịp sau, chưa cộng quãng đường.
                if (!position) {
                  return;
                }

                const point = {
                  latitude: position.latitude,
                  longitude: position.longitude,
                  speedKmh: position.finished ? 0 : speedKmh,
                  recordedAt: new Date().toISOString(),
                };

                void (
                  kind === "trip"
                    ? sendGpsUpdate(socket, {
                        ...point,
                        tripId: id,
                        headingDeg: position.headingDeg,
                      })
                    : sendShuttleGpsUpdate(socket, {
                        ...point,
                        shuttleTripId: id,
                        heading: position.headingDeg,
                      })
                ).catch(() => {
                  /* bỏ qua lỗi 1 điểm, tiếp tục phát điểm sau */
                });

                if (!position.finished) {
                  traveledMeters += stepMeters;
                }
              }, GPS_TIME_INTERVAL_MS);
            } else {
              watchRef.current = await Location.watchPositionAsync(
                {
                  accuracy: Location.Accuracy.High,
                  timeInterval: GPS_TIME_INTERVAL_MS,
                  distanceInterval: GPS_DISTANCE_INTERVAL_M,
                },
                (location) => {
                  // Fire-and-forget từng điểm; lỗi ack chỉ chuyển trạng thái, không throw.
                  void (
                    kind === "trip"
                      ? sendGpsUpdate(socket, toTripGpsPayload(id, location))
                      : sendShuttleGpsUpdate(
                          socket,
                          toShuttleGpsPayload(id, location),
                        )
                  ).catch(() => {
                    /* bỏ qua lỗi 1 điểm, tiếp tục phát điểm sau */
                  });
                },
              );
            }

            if (cancelled) {
              // Nếu bị hủy ngay sau khi tạo watch/timer, dọn luôn.
              watchRef.current?.remove();
              watchRef.current = null;
              if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
              }
              return;
            }

            setStatus("tracking");
          })
          .catch(() => {
            // Join bị từ chối (sai scope, trip không tồn tại, provider lỗi).
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
  }, [target?.kind, target?.id, enabled, cleanup, queryClient]);

  // Lọc theo id hiện tại thay vì reset state khi đổi chuyến — tránh setState
  // trong thân effect, và cảnh báo của chuyến cũ tự hết hiệu lực.
  const currentDelay =
    target?.kind === "trip" && delay?.tripId === target.id ? delay : null;
  const currentEta =
    target?.kind === "trip" && lastEta?.tripId === target.id ? lastEta : null;
  const currentEtaBatch =
    target?.kind === "trip" && etaBatch?.tripId === target.id ? etaBatch : null;
  const currentShuttleEta =
    target?.kind === "shuttle" && shuttleEta?.shuttleTripId === target.id
      ? shuttleEta
      : null;
  const currentBooking =
    target?.kind === "trip" && bookingEvent?.tripId === target.id
      ? bookingEvent
      : null;
  const currentBookingUpdate =
    target?.kind === "trip" && bookingUpdate?.tripId === target.id
      ? bookingUpdate
      : null;

  return {
    status,
    delay: currentDelay,
    eta: currentEta,
    etaBatch: currentEtaBatch,
    shuttleEta: currentShuttleEta,
    bookingEvent: currentBooking,
    bookingUpdate: currentBookingUpdate,
  };
}
