import { apiRequest } from "./client";
import type { TripRouteData } from "./types";

// Hình học tuyến của chuyến được phân công. Dùng prefix /v1/driver cho CẢ
// DRIVER lẫn ASSISTANT (theo BE). Backend kiểm quyền theo assignment:
// không được phân công chuyến → 403 "Caller is not assigned to this trip".
export function getTripRoute(tripId: string): Promise<TripRouteData> {
  return apiRequest<TripRouteData>(`/v1/driver/trips/${tripId}/route`);
}
