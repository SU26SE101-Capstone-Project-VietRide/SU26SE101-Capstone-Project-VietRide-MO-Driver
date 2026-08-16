import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getMySchedule, getSeatMap, getTrip } from "@/api/trips";
import type { ScheduleTrip, TripDetails } from "@/api/types";

import {
  isoDateOf,
  normalizeTripStatus,
  type NormalizedTripStatus,
} from "./trip-format";

export function useDriverSchedule(from: string, to: string) {
  return useQuery({
    queryKey: ["schedule", from, to],
    queryFn: () => getMySchedule(from, to),
  });
}

// Nhịp poll cho màn điều hành đang mở — cố ý bằng 25s của useManifest để hai
// màn crew không đọc dữ liệu ở hai thời điểm khác nhau.
const TRIP_LIVE_REFETCH_MS = 25_000;

// `live` chỉ bật ở màn đang trực tiếp điều hành chuyến. seatSummary đổi mỗi lần
// khách đặt/hủy vé, mà socket booking của màn Chuyến chỉ nối khi chuyến đang
// chạy/đón khách; RN cũng không có focusManager nên refetchOnWindowFocus vô
// hiệu. Thiếu nhịp này thì ô "Ghế đã đặt" của tài xế đứng yên tới lúc kéo
// xuống refresh, trong khi manifest của phụ xe vẫn poll 25s → hai màn lệch nhau.
export function useTripDetails(
  tripId: string | null,
  options: { live?: boolean } = {},
) {
  return useQuery({
    queryKey: ["trip", tripId],
    queryFn: () => getTrip(tripId as string),
    enabled: tripId != null,
    refetchInterval: options.live ? TRIP_LIVE_REFETCH_MS : undefined,
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

// Chuyến "đang hoạt động" của crew: ưu tiên chuyến đang chạy/đang đón khách
// (IN_PROGRESS hoặc BOARDING), fallback chuyến sắp khởi hành gần nhất.
//
// Khung ngày lấy TỪ HÔM QUA chứ không chỉ hôm nay: chuyến đêm khởi hành 22:30
// và tới nơi 03:58 hôm sau vẫn đang chạy lúc 2 giờ sáng, nhưng nó nằm trong
// lịch NGÀY HÔM TRƯỚC. Chỉ quét hôm nay thì đúng lúc tài xế cần màn điều hành
// nhất lại mất chuyến, và app nhảy sang ca sáng kế tiếp.
// Chuyến hôm qua đã xong không lọt vào: COMPLETED không khớp nhánh active, còn
// nhánh "sắp tới" đã lọc theo estimatedArrivalTime > now.
// Xe trễ vài tiếng vẫn là chuyến hiện tại; quá 6 tiếng so với giờ đến dự kiến
// thì coi như dữ liệu kẹt, không phải chuyến đang chạy nữa.
const STALE_ACTIVE_MS = 6 * 60 * 60 * 1000;

export function useActiveTrip() {
  const now = new Date();
  const today = isoDateOf(now);
  const yesterday = isoDateOf(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const query = useDriverSchedule(yesterday, today);

  const trip = useMemo<ScheduleTrip | null>(() => {
    const trips = query.data?.trips ?? [];
    // Chốt "bây giờ" mỗi lần data đổi — tránh gọi impure Date.now() khi render.
    const now = new Date().getTime();

    // Chuyến hôm qua bị kẹt ở BOARDING/IN_PROGRESS (crew quên bấm hoàn tất) sẽ
    // chiếm chỗ chuyến hôm nay vĩnh viễn nếu chỉ xét status. Chấp nhận trễ tối
    // đa STALE_ACTIVE_MS so với giờ đến dự kiến — xe chạy trễ vài tiếng vẫn là
    // chuyến hiện tại, còn chuyến của đêm trước thì không.
    const active = trips
      .filter((item) => {
        const status = normalizeTripStatus(item.status);
        return status === "IN_PROGRESS" || status === "BOARDING";
      })
      .filter(
        (item) =>
          new Date(item.estimatedArrivalTime).getTime() >= now - STALE_ACTIVE_MS,
      )
      // Nhiều chuyến cùng đang mở → lấy chuyến khởi hành gần hiện tại nhất.
      .sort(
        (a, b) =>
          new Date(b.departureDateTime).getTime() -
          new Date(a.departureDateTime).getTime(),
      );

    if (active[0]) {
      return active[0];
    }

    // Bỏ chuyến đã hủy/gián đoạn khỏi danh sách "sắp tới".
    const skipped: NormalizedTripStatus[] = ["CANCELLED", "DISRUPTED"];
    const upcoming = trips
      .filter((item) => !skipped.includes(normalizeTripStatus(item.status)))
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
