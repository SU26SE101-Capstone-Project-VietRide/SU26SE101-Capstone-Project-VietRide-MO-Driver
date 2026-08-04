import type { GeoPoint, TripRouteGeometryData } from "@/api/types";

// Cờ mô phỏng xe chạy dùng cho DEMO/thử nghiệm. MẶC ĐỊNH TẮT — chỉ bật bằng
// EXPO_PUBLIC_FAKE_GPS=true trong .env khi cần trình diễn mà không có xe thật.
// Khi bật, app KHÔNG đọc GPS thiết bị mà tự đi dọc tuyến của chuyến.
export const FAKE_GPS_ENABLED = process.env.EXPO_PUBLIC_FAKE_GPS === "true";

const DEFAULT_SPEED_KMH = 60;

// Tốc độ mô phỏng, đổi được bằng EXPO_PUBLIC_FAKE_GPS_SPEED_KMH.
export function fakeGpsSpeedKmh(): number {
  const raw = Number(process.env.EXPO_PUBLIC_FAKE_GPS_SPEED_KMH);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SPEED_KMH;
}

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

// Khoảng cách great-circle giữa 2 toạ độ.
function distanceMeters(from: GeoPoint, to: GeoPoint): number {
  const dLat = toRad(to.latitude - from.latitude);
  const dLng = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Hướng di chuyển (0..360) để payload có headingDeg giống GPS thật.
function bearingDeg(from: GeoPoint, to: GeoPoint): number {
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLng = toRad(to.longitude - from.longitude);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Đường để mô phỏng: ưu tiên polyline thật của tuyến; chuyến chưa có polyline
// thì nối origin → các điểm dừng → điểm đến.
// LƯU Ý: đây CHỈ dùng để sinh toạ độ giả khi demo, không phải thứ đem vẽ lên
// bản đồ — bản đồ vẫn tuân thủ quy tắc "geometry null thì không vẽ tuyến".
export function buildSimulationPath(
  route: TripRouteGeometryData | null | undefined,
): GeoPoint[] {
  if (!route) {
    return [];
  }

  const real = route.geometry?.points ?? [];
  if (real.length >= 2) {
    return real;
  }

  const fallback: GeoPoint[] = [];

  if (route.originStation) {
    fallback.push({
      latitude: route.originStation.latitude,
      longitude: route.originStation.longitude,
    });
  }

  route.intermediateStops
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .forEach((stop) => {
      fallback.push({ latitude: stop.latitude, longitude: stop.longitude });
    });

  if (route.destinationStation) {
    fallback.push({
      latitude: route.destinationStation.latitude,
      longitude: route.destinationStation.longitude,
    });
  }

  return fallback.length >= 2 ? fallback : [];
}

export type SimulatedPosition = {
  latitude: number;
  longitude: number;
  headingDeg: number;
  // true khi đã tới cuối tuyến — caller nên dừng mô phỏng.
  finished: boolean;
};

// Vị trí sau khi đã đi được `traveledMeters` dọc theo path. Nội suy tuyến tính
// trong đoạn đang đi nên xe chạy mượt chứ không nhảy từ điểm này sang điểm kia.
export function positionAlongPath(
  path: GeoPoint[],
  traveledMeters: number,
): SimulatedPosition | null {
  if (path.length < 2) {
    return null;
  }

  let remaining = Math.max(0, traveledMeters);

  for (let i = 0; i < path.length - 1; i += 1) {
    const from = path[i];
    const to = path[i + 1];
    const segment = distanceMeters(from, to);

    // Bỏ qua điểm trùng nhau để không chia cho 0.
    if (segment <= 0) {
      continue;
    }

    if (remaining <= segment) {
      const ratio = remaining / segment;
      return {
        latitude: from.latitude + (to.latitude - from.latitude) * ratio,
        longitude: from.longitude + (to.longitude - from.longitude) * ratio,
        headingDeg: bearingDeg(from, to),
        finished: false,
      };
    }

    remaining -= segment;
  }

  // Đi hết tuyến: đứng lại ở điểm cuối.
  const last = path[path.length - 1];
  const prev = path[path.length - 2];

  return {
    latitude: last.latitude,
    longitude: last.longitude,
    headingDeg: bearingDeg(prev, last),
    finished: true,
  };
}
