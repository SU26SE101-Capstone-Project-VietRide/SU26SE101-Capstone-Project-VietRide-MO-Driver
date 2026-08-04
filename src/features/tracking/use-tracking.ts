import { useQuery } from "@tanstack/react-query";

import { getLatestLocation, getTripEta } from "@/api/tracking";

// ETA tới 1 stop (từ Tracking service).
// Nguồn CHÍNH là broadcast `eta:update` qua socket — useGpsBroadcast ghi thẳng
// vào cache của query này (cùng queryKey). REST chỉ còn để lấy giá trị đầu tiên
// và làm lưới an toàn khi socket chưa kết nối / rớt, nên nhịp thưa lại 60s.
export function useTripEta(tripId: string | null, stopId: string | null) {
  return useQuery({
    queryKey: ["tracking-eta", tripId, stopId],
    queryFn: () => getTripEta(tripId as string, stopId as string),
    enabled: tripId != null && stopId != null,
    refetchInterval: 60_000,
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
