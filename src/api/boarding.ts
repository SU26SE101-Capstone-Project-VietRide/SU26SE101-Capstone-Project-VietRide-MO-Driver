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

// BE xác nhận (2026-07-28): QR trên vé do app khách render encode ticketCode
// (BE tạo riêng từng vé, không sinh ảnh QR). Chỉ Booking CONFIRMED + vé
// ISSUED/USED quét được. Body hiện gửi field `bookingCode` (nhập tay vẫn dùng
// mã booking); đang chờ BE chốt schema chính thức cho giá trị quét từ QR —
// xem BE-GAPS.md mục 2.
export function scanQr(
  tripId: string,
  code: string,
): Promise<{ items: QrScanResultItem[] }> {
  return apiRequest<{ items: QrScanResultItem[] }>(
    `/v1/bookings/trips/${tripId}/boarding/qr-scan`,
    { method: "POST", body: { bookingCode: code } },
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
