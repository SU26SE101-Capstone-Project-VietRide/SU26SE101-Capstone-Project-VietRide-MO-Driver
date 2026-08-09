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
};

// Manifest trả từng ghế một dòng → gộp theo bookingCode cho dễ thao tác.
export function groupManifestByBooking(items: ManifestItem[]): BookingGroup[] {
  const groups = new Map<string, BookingGroup>();

  for (const item of items) {
    const group = groups.get(item.bookingCode) ?? {
      bookingCode: item.bookingCode,
      seats: [],
      boarded: true,
    };

    group.seats.push(item.seatNumber);
    // Nhóm coi là "đã lên" khi TẤT CẢ ghế đã lên.
    group.boarded = group.boarded && isBoardedStatus(item.boardingStatus);
    groups.set(item.bookingCode, group);
  }

  return [...groups.values()];
}
