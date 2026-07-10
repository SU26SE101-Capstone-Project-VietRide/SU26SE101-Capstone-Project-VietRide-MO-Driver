import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getMySchedule, getSeatMap, getTrip } from "@/api/trips";
import type { ScheduleTrip, TripDetails } from "@/api/types";

import { isoDateOf, normalizeTripStatus } from "./trip-format";

export function useDriverSchedule(from: string, to: string) {
  return useQuery({
    queryKey: ["schedule", from, to],
    queryFn: () => getMySchedule(from, to),
  });
}

export function useTripDetails(tripId: string | null) {
  return useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => getTrip(tripId as string),
    enabled: tripId != null,
  });
}

// Chi tiết nhiều chuyến (các ca trong ngày đang chọn) — chạy song song, cache theo tripId.
export function useTripDetailsMany(tripIds: string[]) {
  const results = useQueries({
    queries: tripIds.map((tripId) => ({
      queryKey: ["trip", tripId],
      queryFn: () => getTrip(tripId),
    })),
  });

  // Map nhỏ (vài ca/ngày) → dựng lại mỗi render là đủ rẻ, khỏi memo.
  const byId = new Map<string, TripDetails>();
  results.forEach((result) => {
    if (result.data) {
      byId.set(result.data.tripId, result.data);
    }
  });
  return byId;
}

export function useSeatMap(tripId: string | null) {
  return useQuery({
    queryKey: ["seat-map", tripId],
    queryFn: () => getSeatMap(tripId as string),
    enabled: tripId != null,
  });
}

// Chuyến "đang hoạt động" của crew: ưu tiên IN_PROGRESS, fallback chuyến
// sắp khởi hành gần nhất trong hôm nay. Dùng cho màn Chuyến đang chạy + Boarding.
export function useActiveTrip() {
  const today = isoDateOf(new Date());
  const query = useDriverSchedule(today, today);

  const trip = useMemo<ScheduleTrip | null>(() => {
    const trips = query.data?.trips ?? [];
    // Chốt "bây giờ" mỗi lần data đổi — tránh gọi impure Date.now() khi render.
    const now = new Date().getTime();

    const inProgress = trips.find(
      (item) => normalizeTripStatus(item.status) === "IN_PROGRESS",
    );

    if (inProgress) {
      return inProgress;
    }

    const upcoming = trips
      .filter((item) => normalizeTripStatus(item.status) !== "CANCELLED")
      .filter((item) => new Date(item.estimatedArrivalTime).getTime() > now)
      .sort(
        (a, b) =>
          new Date(a.departureDateTime).getTime() -
          new Date(b.departureDateTime).getTime(),
      );

    return upcoming[0] ?? null;
  }, [query.data]);

  return {
    trip,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
