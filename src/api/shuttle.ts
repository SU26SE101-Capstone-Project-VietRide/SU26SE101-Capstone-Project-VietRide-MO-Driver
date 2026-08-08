import { apiRequest } from "./client";
import type {
  DriverShuttleTripsData,
  ShuttleLifecycleData,
  ShuttleManifestData,
} from "./types";

// API shuttle (xe trung chuyển) cho driver — docs/Implements/API-Driver-Assistant.md.
// Chỉ role DRIVER; backend đối chiếu JWT sub với driverUserId của ShuttleTrip.
// Mutation nào cũng cần Idempotency-Key — apiRequest tự gắn cho mọi mutation.

// Danh sách ShuttleTrip được gán cho driver hiện tại (loại CANCELLED).
// Không truyền from/to thì backend tự default: hôm nay → +14 ngày theo ICT.
export function getDriverShuttleTrips(
  from?: string,
  to?: string,
): Promise<DriverShuttleTripsData> {
  const params = new URLSearchParams();
  if (from) {
    params.set("from", from);
  }
  if (to) {
    params.set("to", to);
  }
  const query = params.toString();
  return apiRequest<DriverShuttleTripsData>(
    `/v1/driver/shuttle-trips${query ? `?${query}` : ""}`,
  );
}

// Manifest điểm đón của 1 ShuttleTrip (sort sẵn theo pickupOrder).
export function getShuttleManifest(
  shuttleTripId: string,
): Promise<ShuttleManifestData> {
  return apiRequest<ShuttleManifestData>(
    `/v1/driver/shuttle-trips/${shuttleTripId}/manifest`,
  );
}

// SCHEDULED -> IN_PROGRESS.
export function startShuttle(
  shuttleTripId: string,
): Promise<ShuttleLifecycleData> {
  return apiRequest<ShuttleLifecycleData>(
    `/v1/driver/shuttle-trips/${shuttleTripId}/start`,
    { method: "POST" },
  );
}

// Cả group PENDING -> PICKED_UP.
export function pickupShuttleStop(
  shuttleTripId: string,
  pickupOrder: number,
): Promise<ShuttleLifecycleData> {
  return apiRequest<ShuttleLifecycleData>(
    `/v1/driver/shuttle-trips/${shuttleTripId}/stops/${pickupOrder}/pickup`,
    { method: "POST" },
  );
}

// Cả group PICKED_UP -> DELIVERED (dùng khi đã tới bến).
export function deliverShuttleStop(
  shuttleTripId: string,
  pickupOrder: number,
): Promise<ShuttleLifecycleData> {
  return apiRequest<ShuttleLifecycleData>(
    `/v1/driver/shuttle-trips/${shuttleTripId}/stops/${pickupOrder}/delivered`,
    { method: "POST" },
  );
}

// Cả group PENDING -> NO_SHOW. reason bắt buộc không rỗng.
export function noShowShuttleStop(
  shuttleTripId: string,
  pickupOrder: number,
  reason: string,
): Promise<ShuttleLifecycleData> {
  return apiRequest<ShuttleLifecycleData>(
    `/v1/driver/shuttle-trips/${shuttleTripId}/stops/${pickupOrder}/no-show`,
    { method: "POST", body: { reason } },
  );
}

// IN_PROGRESS -> COMPLETED. 409 SHUTTLE_PASSENGERS_PENDING nếu còn khách chưa xử lý.
export function completeShuttle(
  shuttleTripId: string,
): Promise<ShuttleLifecycleData> {
  return apiRequest<ShuttleLifecycleData>(
    `/v1/driver/shuttle-trips/${shuttleTripId}/complete`,
    { method: "POST" },
  );
}
