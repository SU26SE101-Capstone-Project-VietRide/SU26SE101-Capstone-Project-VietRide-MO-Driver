import { apiRequest } from "./client";
import type {
  BoardPassengerData,
  ManifestItem,
  QrScanResultItem,
} from "./types";

export function getManifest(
  tripId: string,
): Promise<{ items: ManifestItem[] }> {
  return apiRequest<{ items: ManifestItem[] }>(
    `/v1/bookings/trips/${tripId}/manifest`,
  );
}

export function scanQr(
  tripId: string,
  bookingCode: string,
): Promise<{ items: QrScanResultItem[] }> {
  return apiRequest<{ items: QrScanResultItem[] }>(
    `/v1/bookings/trips/${tripId}/boarding/qr-scan`,
    { method: "POST", body: { bookingCode } },
  );
}

// Check-in theo passengerRecordId. Manifest hiện CHƯA trả id này (gap backend)
// nên UI đang check-in bằng scanQr(bookingCode); giữ hàm để dùng khi backend bổ sung.
export function boardPassenger(
  tripId: string,
  passengerRecordId: string,
): Promise<BoardPassengerData> {
  return apiRequest<BoardPassengerData>(
    `/v1/bookings/trips/${tripId}/boarding/passenger/${passengerRecordId}`,
    { method: "POST" },
  );
}
