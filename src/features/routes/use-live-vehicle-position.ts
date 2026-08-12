import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";

import type { GeoPoint } from "@/api/types";
import {
  FAKE_GPS_ENABLED,
  fakeGpsSpeedKmh,
  positionAlongPath,
} from "@/features/tracking/fake-gps-route";

import type { VehiclePosition } from "./trip-route-map";

// Nhịp cập nhật vị trí cho màn theo dõi — 3s đủ mượt cho camera bám xe.
const WATCH_TIME_INTERVAL_MS = 3000;
const WATCH_DISTANCE_INTERVAL_M = 10;

// Đọc vị trí xe liên tục cho màn theo dõi hành trình (KHÔNG phát socket —
// việc phát đã có useGpsBroadcast ở màn Chuyến lo).
// - Bình thường: expo-location watch, heading lấy từ coords.heading.
// - EXPO_PUBLIC_FAKE_GPS=true: tự đi dọc simulationPath như use-gps-broadcast
//   để demo không cần xe thật.
export function useLiveVehiclePosition(
  enabled: boolean,
  simulationPath: GeoPoint[] = [],
): VehiclePosition | null {
  const [position, setPosition] = useState<VehiclePosition | null>(null);
  // Giữ path trong ref để path tải xong không restart effect (mất tiến độ mô phỏng).
  const pathRef = useRef<GeoPoint[]>(simulationPath);
  useEffect(() => {
    pathRef.current = simulationPath;
  }, [simulationPath]);

  useEffect(() => {
    if (!enabled) {
      // Không reset state trong thân effect (rule react-hooks/set-state-in-
      // effect) — return cuối hook đã lọc theo `enabled` rồi.
      return;
    }

    let cancelled = false;
    let watch: Location.LocationSubscription | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    if (FAKE_GPS_ENABLED) {
      const speedKmh = fakeGpsSpeedKmh();
      const stepMeters = (speedKmh / 3.6) * (WATCH_TIME_INTERVAL_MS / 1000);
      let traveledMeters = 0;

      timer = setInterval(() => {
        const sim = positionAlongPath(pathRef.current, traveledMeters);
        // Tuyến chưa tải xong thì chờ nhịp sau, chưa cộng quãng đường.
        if (!sim || cancelled) {
          return;
        }
        setPosition({
          latitude: sim.latitude,
          longitude: sim.longitude,
          headingDeg: sim.headingDeg,
          speedKmh: sim.finished ? 0 : speedKmh,
        });
        if (!sim.finished) {
          traveledMeters += stepMeters;
        }
      }, WATCH_TIME_INTERVAL_MS);
    } else {
      const start = async () => {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled || !permission.granted) {
          return;
        }
        watch = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: WATCH_TIME_INTERVAL_MS,
            distanceInterval: WATCH_DISTANCE_INTERVAL_M,
          },
          (location) => {
            if (cancelled) {
              return;
            }
            const { coords } = location;
            setPosition({
              latitude: coords.latitude,
              longitude: coords.longitude,
              // heading = -1 nghĩa là không có la bàn/GPS course.
              headingDeg:
                coords.heading != null && coords.heading >= 0
                  ? coords.heading
                  : null,
              // speed của expo-location là m/s → đổi km/h; âm nghĩa là không có.
              speedKmh:
                coords.speed != null && coords.speed >= 0
                  ? coords.speed * 3.6
                  : null,
            });
          },
        );
        // Nếu bị hủy ngay sau khi tạo watch, dọn luôn.
        if (cancelled) {
          watch?.remove();
          watch = null;
        }
      };
      void start();
    }

    return () => {
      cancelled = true;
      watch?.remove();
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [enabled]);

  // Lọc theo `enabled` thay vì reset state trong effect — tắt theo dõi là vị
  // trí cũ hết hiệu lực ngay.
  return enabled ? position : null;
}
