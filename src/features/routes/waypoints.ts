import type { GeoPoint } from "@/api/types";

// Helper dùng chung cho màn dẫn đường turn-by-turn. Để riêng file này (không
// nằm trong turn-by-turn-screen.tsx) để màn khác encode waypoint mà không phải
// import module có MapboxNavigationView — tránh kéo native view vào bundle của
// những màn không dẫn đường.

// Toạ độ hợp lệ mới đưa vào danh sách dẫn đường.
export function isValidPoint(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

// Chuỗi waypoint truyền qua route param: "lat,lng;lat,lng;…" theo đúng thứ tự
// cần đi qua.
export function encodeWaypointsParam(points: GeoPoint[]): string {
  return points.map((p) => `${p.latitude},${p.longitude}`).join(";");
}

// Chỉ một điểm sai định dạng là bỏ cả chuỗi — dẫn nhầm thứ tự nguy hiểm hơn
// là không dẫn.
export function parseWaypointsParam(raw: string | undefined): GeoPoint[] | null {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }
  const points: GeoPoint[] = [];
  for (const chunk of raw.split(";")) {
    const [lat, lng] = chunk.split(",");
    const point = { latitude: Number(lat), longitude: Number(lng) };
    if (!isValidPoint(point)) {
      return null;
    }
    points.push(point);
  }
  return points.length > 0 ? points : null;
}
