import { apiRequest } from "./client";
import type {
  GpsTrailData,
  LatestLocationData,
  TripEtaData,
} from "./types";

// Vị trí mới nhất của trip (Redis). Trả latest = null nếu chưa có điểm hợp lệ.
export function getLatestLocation(
  tripId: string,
): Promise<LatestLocationData> {
  return apiRequest<LatestLocationData>(
    `/v1/tracking/trips/${tripId}/latest`,
  );
}

export type TripTrailParams = {
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  sortDir?: "asc" | "desc";
};

// Lịch sử GPS trail (Postgres, phân trang). sortBy backend chỉ nhận recordedAt.
export function getTripTrail(
  tripId: string,
  params: TripTrailParams = {},
): Promise<GpsTrailData> {
  const query = new URLSearchParams();

  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.page != null) query.set("page", String(params.page));
  if (params.pageSize != null) query.set("pageSize", String(params.pageSize));
  if (params.sortDir) query.set("sortDir", params.sortDir);

  const queryString = query.toString();
  const suffix = queryString ? `?${queryString}` : "";
  return apiRequest<GpsTrailData>(
    `/v1/tracking/trips/${tripId}/trail${suffix}`,
  );
}

// ETA tới 1 stop (Redis). Trả eta = null nếu chưa có cache.
export function getTripEta(
  tripId: string,
  stopId: string,
): Promise<TripEtaData> {
  const query = new URLSearchParams({ stopId });
  return apiRequest<TripEtaData>(
    `/v1/tracking/trips/${tripId}/eta?${query}`,
  );
}
