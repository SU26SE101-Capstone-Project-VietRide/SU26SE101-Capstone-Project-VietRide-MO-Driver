import { useQuery } from "@tanstack/react-query";

import { getTripRoute } from "@/api/routes";

// Hình học tuyến gần như không đổi trong 1 chuyến → cache lâu.
export function useTripRoute(tripId: string | null) {
  return useQuery({
    queryKey: ["trip-route", tripId],
    queryFn: () => getTripRoute(tripId as string),
    enabled: tripId != null,
    staleTime: 10 * 60_000,
  });
}
