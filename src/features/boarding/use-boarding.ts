import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { boardPassenger, getManifest, scanQr } from "@/api/boarding";
import type { ManifestItem } from "@/api/types";

export function useManifest(tripId: string | null) {
  return useQuery({
    queryKey: ["manifest", tripId],
    queryFn: () => getManifest(tripId as string),
    enabled: tripId != null,
    // Fallback khi lỡ socket/FCM (FE-REQUEST-realtime-booking-notify §3.3):
    // poll 25s để manifest không bao giờ lệch quá lâu; tín hiệu realtime
    // (booking:updated, push) vẫn invalidate ngay khi tới.
    refetchInterval: 25_000,
  });
}

export function useQrScanMutation(tripId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    // Scan chỉ tra cứu vé; muốn tính là "đã lên xe" phải gọi tiếp
    // boardPassenger cho từng passengerRecordId chưa boarded (BE-GAPS-RESPONSE §2).
    mutationFn: async (code: string) => {
      const result = await scanQr(tripId as string, code.trim().toUpperCase());

      await Promise.all(
        result.items
          .filter((item) => !isBoardedStatus(item.boardingStatus))
          .map((item) =>
            boardPassenger(tripId as string, item.passengerRecordId),
          ),
      );

      return result;
    },
    onSuccess: () => {
      // Check-in xong → manifest và seat-map đổi trạng thái.
      void queryClient.invalidateQueries({ queryKey: ["manifest", tripId] });
      void queryClient.invalidateQueries({ queryKey: ["seat-map", tripId] });
    },
  });
}

// Xác nhận lên xe cho các ghế đã biết passengerRecordId (lấy từ manifest).
// KHÔNG đi qua qr-scan: validator `bookingCode` của backend từ chối cả mã do
// chính nó sinh ra (BE-GAPS.md §5 — hỏi từ 2026-07-29, chưa có trả lời), nên
// bấm nút trên manifest mà gọi qr-scan là chắc chắn 422.
export function useBoardPassengers(tripId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (passengerRecordIds: string[]) => {
      // Tuần tự, không Promise.all: mỗi ghế là một thao tác nghiệp vụ riêng —
      // ghế sau lỗi thì ghế trước vẫn phải được ghi nhận, và lỗi trả về là lỗi
      // của ghế đầu tiên fail để phụ xe biết đúng chỗ tắc.
      const boarded: string[] = [];
      for (const id of passengerRecordIds) {
        await boardPassenger(tripId as string, id);
        boarded.push(id);
      }
      return boarded;
    },
    // Chạy cả khi lỗi giữa chừng: vài ghế có thể đã lên xe thật.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["manifest", tripId] });
      void queryClient.invalidateQueries({ queryKey: ["seat-map", tripId] });
    },
  });
}

// boardingStatus là string tự do (vd BOARDED / NOT_BOARDED / PENDING…).
export function isBoardedStatus(status: string): boolean {
  const normalized = status.toLowerCase();

  if (
    normalized.includes("not") ||
    normalized.includes("pending") ||
    normalized.startsWith("un")
  ) {
    return false;
  }

  return normalized.includes("board") || normalized.includes("checked");
}

export type BookingGroup = {
  bookingCode: string;
  seats: string[];
  boarded: boolean;
  // passengerRecordId của các ghế CHƯA lên xe — đầu vào cho boardPassenger.
  pendingRecordIds: string[];
};

// Manifest trả từng ghế một dòng → gộp theo bookingCode cho dễ thao tác.
export function groupManifestByBooking(items: ManifestItem[]): BookingGroup[] {
  const groups = new Map<string, BookingGroup>();

  for (const item of items) {
    const group = groups.get(item.bookingCode) ?? {
      bookingCode: item.bookingCode,
      seats: [],
      boarded: true,
      pendingRecordIds: [],
    };

    group.seats.push(item.seatNumber);
    // Nhóm coi là "đã lên" khi TẤT CẢ ghế đã lên.
    if (!isBoardedStatus(item.boardingStatus)) {
      group.boarded = false;
      if (item.passengerRecordId) {
        group.pendingRecordIds.push(item.passengerRecordId);
      }
    }
    groups.set(item.bookingCode, group);
  }

  return [...groups.values()];
}
