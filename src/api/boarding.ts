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

// BE chốt schema (BE-GAPS-RESPONSE.md §2): body nhận đúng MỘT trong hai field —
// mã `VT-...` (ticketCode, QR trên vé) gửi `ticketCode`, mã booking `VR-...`
// (nhập tay/legacy) gửi `bookingCode`. Gửi sai field bị validation 422.
// Scan chỉ đọc dữ liệu vé, KHÔNG tự xác nhận lên xe — sau scan phải gọi
// boardPassenger(passengerRecordId).
export function scanQr(
  tripId: string,
  code: string,
): Promise<{ items: QrScanResultItem[] }> {
  const body = code.startsWith("VT-")
    ? { ticketCode: code }
    : { bookingCode: code };

  return apiRequest<{ items: QrScanResultItem[] }>(
    `/v1/bookings/trips/${tripId}/boarding/qr-scan`,
    { method: "POST", body },
  );
}

// Xác nhận hành khách đã lên xe theo passengerRecordId (lấy từ response scanQr).
export function boardPassenger(
  tripId: string,
  passengerRecordId: string,
): Promise<BoardPassengerData> {
  return apiRequest<BoardPassengerData>(
    `/v1/bookings/trips/${tripId}/boarding/passenger/${passengerRecordId}`,
    { method: "POST" },
  );
}
