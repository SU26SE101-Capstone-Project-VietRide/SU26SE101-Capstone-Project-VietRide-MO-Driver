import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getManifest, scanQr } from "@/api/boarding";
import type { ManifestItem } from "@/api/types";

export function useManifest(tripId: string | null) {
  return useQuery({
    queryKey: ["manifest", tripId],
    queryFn: () => getManifest(tripId as string),
    enabled: tripId != null,
  });
}

export function useQrScanMutation(tripId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingCode: string) =>
      scanQr(tripId as string, bookingCode.trim().toUpperCase()),
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
