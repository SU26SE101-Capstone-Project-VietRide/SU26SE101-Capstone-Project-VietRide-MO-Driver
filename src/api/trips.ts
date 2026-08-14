import { apiRequest } from "./client";
import type { DriverScheduleData, SeatMapData, TripDetails } from "./types";

// Lịch làm việc của chính user (tài xế lẫn phụ xe đều dùng endpoint này;
// phân biệt vai trò qua assignmentRole trong từng trip).
export function getMySchedule(
  from: string,
  to: string,
): Promise<DriverScheduleData> {
  const query = new URLSearchParams({ from, to });
  return apiRequest<DriverScheduleData>(`/v1/driver/me/schedule?${query}`);
}

export function getTrip(tripId: string): Promise<TripDetails> {
  return apiRequest<TripDetails>(`/v1/trips/${tripId}`);
}

// Sơ đồ ghế + hành lang từ seat-layout snapshot của Trip. KHÔNG gọi thêm
// Vehicle API để lấy aisle — template xe có thể đã bị sửa sau khi Trip
// snapshot (FE-RESPONSE-seat-map-aisle.md §5).
export async function getSeatMap(tripId: string): Promise<SeatMapData> {
  const data = await apiRequest<SeatMapData>(`/v1/trips/${tripId}/seat-map`);
  // Rolling deploy: BE cũ có thể thiếu field → chuẩn hoá về []. Chỉ vậy thôi,
  // KHÔNG tự chèn aisle nào (doc §3).
  return { ...data, aisles: Array.isArray(data.aisles) ? data.aisles : [] };
}
