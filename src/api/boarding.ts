import { ApiError, apiRequest } from "./client";
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

// Body của qr-scan nhận đúng MỘT trong hai field: mã `VT-...` (ticketCode, QR
// trên vé) gửi `ticketCode`, mã booking `VR-...` / mã nhập tay gửi
// `bookingCode`. Gửi sai field bị validation 422 — mà backend đã đổi schema chỗ
// này ít nhất một lần (BE-GAPS-RESPONSE.md §2), nên đoán theo prefix là không
// chắc: nút "Xác nhận lên xe" ở màn Đón khách gửi bookingCode lấy từ manifest
// thì bị VALIDATION_ERROR, trong khi quét QR (ticketCode) vẫn chạy. Vì vậy:
// thử field đoán được trước, nếu RIÊNG validation fail thì thử lại field còn
// lại rồi mới báo lỗi.
// Scan chỉ đọc dữ liệu vé, KHÔNG tự xác nhận lên xe — sau scan phải gọi
// boardPassenger(passengerRecordId).
const VALIDATION_CODES = new Set(["VALIDATION_ERROR", "VALIDATION_FAILED"]);

function isValidationError(error: unknown): boolean {
  return error instanceof ApiError && VALIDATION_CODES.has(error.code);
}

function postQrScan(
  tripId: string,
  body: { ticketCode: string } | { bookingCode: string },
): Promise<{ items: QrScanResultItem[] }> {
  return apiRequest<{ items: QrScanResultItem[] }>(
    `/v1/bookings/trips/${tripId}/boarding/qr-scan`,
    { method: "POST", body },
  );
}

export async function scanQr(
  tripId: string,
  code: string,
): Promise<{ items: QrScanResultItem[] }> {
  const asTicket = { ticketCode: code };
  const asBooking = { bookingCode: code };
  const [first, second] = code.startsWith("VT-")
    ? [asTicket, asBooking]
    : [asBooking, asTicket];

  try {
    return await postQrScan(tripId, first);
  } catch (error) {
    if (!isValidationError(error)) {
      throw error;
    }

    // Field đoán theo prefix bị backend chặn ngay ở tầng validation → mã này
    // thuộc field còn lại. Log để còn lần ra qua logcat nếu schema đổi tiếp.
    console.warn(
      `[boarding] qr-scan từ chối field ${Object.keys(first)[0]} cho mã ${code}, thử lại với ${Object.keys(second)[0]}`,
      JSON.stringify((error as ApiError).fields),
    );

    try {
      return await postQrScan(tripId, second);
    } catch (retryError) {
      console.warn(
        `[boarding] qr-scan cũng từ chối field ${Object.keys(second)[0]}`,
        JSON.stringify((retryError as ApiError).fields),
      );
      // Cả hai field đều validation fail → mã thật sự sai định dạng; trả lỗi
      // của lần đoán đầu cho khớp với thứ crew vừa nhập/quét.
      throw isValidationError(retryError) ? error : retryError;
    }
  }
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
