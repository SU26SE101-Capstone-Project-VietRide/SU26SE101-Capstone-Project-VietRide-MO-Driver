import { useQuery } from "@tanstack/react-query";

import { getLatestLocation, getTripEta } from "@/api/tracking";

// ETA realtime tới 1 stop (từ Tracking service). Refetch định kỳ vì ETA đổi liên tục
// theo GPS. Trả eta = null khi chưa có cache — UI cần fallback.
export function useTripEta(tripId: string | null, stopId: string | null) {
  return useQuery({
    queryKey: ["tracking-eta", tripId, stopId],
    queryFn: () => getTripEta(tripId as string, stopId as string),
    enabled: tripId != null && stopId != null,
    // ETA thay đổi liên tục; làm mới mỗi 20s và coi là stale ngay.
    refetchInterval: 20_000,
    staleTime: 0,
  });
}

// Vị trí mới nhất của trip (dùng khi cần hiển thị điểm hiện tại).
export function useLatestLocation(tripId: string | null) {
  return useQuery({
    queryKey: ["tracking-latest", tripId],
    queryFn: () => getLatestLocation(tripId as string),
    enabled: tripId != null,
    refetchInterval: 15_000,
    staleTime: 0,
  });
}
