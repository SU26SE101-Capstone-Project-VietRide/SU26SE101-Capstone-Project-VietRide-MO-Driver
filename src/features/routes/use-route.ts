import { useQuery } from "@tanstack/react-query";

import { getTripRouteGeometry } from "@/api/tracking";

// Hình học tuyến gần như không đổi trong 1 chuyến; backend cũng đặt
// Cache-Control max-age=600 → giữ staleTime 10 phút cho khớp.
export function useTripRouteGeometry(tripId: string | null) {
  return useQuery({
    queryKey: ["trip-route-geometry", tripId],
    queryFn: () => getTripRouteGeometry(tripId as string),
    enabled: tripId != null,
    staleTime: 10 * 60_000,
  });
}
