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

export function getSeatMap(tripId: string): Promise<SeatMapData> {
  return apiRequest<SeatMapData>(`/v1/trips/${tripId}/seat-map`);
}
