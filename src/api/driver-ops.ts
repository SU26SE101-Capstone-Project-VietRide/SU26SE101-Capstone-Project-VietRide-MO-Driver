import { apiRequest } from "./client";
import { newIdempotencyKey } from "./idempotency";
import type {
  CompleteTripData,
  DestinationArrivalData,
  ReportIncidentData,
  ReportIncidentInput,
  StopArrivalData,
} from "./types";

// Thao tác vận hành của tài xế/phụ xe trên chuyến đang chạy (API Day 39).
// Cả DRIVER lẫn ASSISTANT đều dùng prefix /v1/driver; backend kiểm quyền bằng
// cách đối chiếu JWT sub với driverUserId/assistantUserId của Trip.
// Mọi mutation bắt buộc Idempotency-Key.

// Báo sự cố trên Trip đang IN_PROGRESS. Không làm đổi trạng thái hay dữ liệu
// vận hành của Trip; backend fan-out notification tới OPERATOR_ADMIN.
export function reportIncident(
  tripId: string,
  input: ReportIncidentInput,
): Promise<ReportIncidentData> {
  return apiRequest<ReportIncidentData>(`/v1/driver/trips/${tripId}/incident`, {
    method: "POST",
    body: input,
    headers: { "Idempotency-Key": newIdempotencyKey() },
  });
}

// Xác nhận xe đã đến một TripStop (PENDING -> ARRIVED). Không body.
// Mở khoá việc dỡ kiện có dropoffStopId trùng stop này.
export function arriveAtStop(
  tripId: string,
  stopId: string,
): Promise<StopArrivalData> {
  return apiRequest<StopArrivalData>(
    `/v1/driver/trips/${tripId}/stops/${stopId}/arrive`,
    {
      method: "POST",
      headers: { "Idempotency-Key": newIdempotencyKey() },
    },
  );
}

// Xác nhận xe đã tới bến cuối. Chạy được cả với chuyến express không có stop.
// KHÔNG hoàn tất chuyến: Trip vẫn IN_PROGRESS, completedAt vẫn null.
// Mở khoá dỡ các kiện không gắn stop (dropoffStopId = null).
export function arriveAtDestination(
  tripId: string,
): Promise<DestinationArrivalData> {
  return apiRequest<DestinationArrivalData>(
    `/v1/driver/trips/${tripId}/destination/arrive`,
    {
      method: "POST",
      headers: { "Idempotency-Key": newIdempotencyKey() },
    },
  );
}

// Hoàn tất chuyến (IN_PROGRESS -> COMPLETED). Không body.
// Đây là bước riêng, tách khỏi destination/arrive.
export function completeTrip(tripId: string): Promise<CompleteTripData> {
  return apiRequest<CompleteTripData>(`/v1/driver/trips/${tripId}/complete`, {
    method: "POST",
    headers: { "Idempotency-Key": newIdempotencyKey() },
  });
}
