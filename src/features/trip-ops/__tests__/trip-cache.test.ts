import {
  invalidateTripLifecycle,
  tripLifecycleQueryKeys,
} from "@/features/trip-ops/trip-cache";
import { withTestQueryClient } from "@/test-utils/query-client";

const TRIP_ID = "b31a345e-255a-4d0f-8f48-0fb3af9c3d17";

// Danh sách này là hợp đồng của FE-PCL-005: thiếu một key nào ở đây nghĩa là
// có một màn/tab giữ dữ liệu cũ sau khi chuyến đổi trạng thái.
const REQUIRED_KEYS = [
  ["schedule"], // bộ chọn chuyến + useActiveTrip đọc status ở đây
  ["trip", TRIP_ID], // status, stops[].status, destinationArrivedAt
  ["assistant-parcels", TRIP_ID], // availableActions của kiện
  ["seat-map", TRIP_ID],
  ["tracking-etas", TRIP_ID],
  ["tracking-eta", TRIP_ID],
];

describe("tripLifecycleQueryKeys", () => {
  it.each(REQUIRED_KEYS)("gồm key %j", (...key) => {
    expect(tripLifecycleQueryKeys(TRIP_ID)).toContainEqual(key);
  });

  it("không sót key nào so với hợp đồng (và không thừa key lạ)", () => {
    expect(tripLifecycleQueryKeys(TRIP_ID)).toHaveLength(REQUIRED_KEYS.length);
  });

  it("`schedule` invalidate theo prefix, không kèm khoảng ngày", () => {
    // Key thật là ["schedule", from, to] và có hai cửa sổ ngày khác nhau
    // (useActiveTrip nhìn lui hôm qua, bộ chọn nhìn tới ngày mai). Chỉ prefix
    // mới phủ được cả hai.
    expect(tripLifecycleQueryKeys(TRIP_ID)).toContainEqual(["schedule"]);
  });

  it("chưa chọn chuyến thì chỉ làm mới lịch, không tạo key có tripId null", () => {
    expect(tripLifecycleQueryKeys(null)).toEqual([["schedule"]]);
  });
});

describe("invalidateTripLifecycle", () => {
  it("gọi invalidateQueries đúng từng key trong hợp đồng", () =>
    withTestQueryClient(async (queryClient) => {
      const invalidate = jest
        .spyOn(queryClient, "invalidateQueries")
        .mockResolvedValue(undefined);

      await invalidateTripLifecycle(queryClient, TRIP_ID);

      for (const queryKey of REQUIRED_KEYS) {
        expect(invalidate).toHaveBeenCalledWith({ queryKey });
      }
      expect(invalidate).toHaveBeenCalledTimes(REQUIRED_KEYS.length);
    }));

  it("đánh dấu stale query lịch của MỌI cửa sổ ngày", () =>
    withTestQueryClient(async (queryClient) => {
      // Hai cửa sổ ngày mà app thực sự dùng song song: useActiveTrip nhìn lui
      // hôm qua, bộ chọn chuyến nhìn tới ngày mai.
      queryClient.setQueryData(["schedule", "2026-08-30", "2026-08-31"], {
        trips: [],
      });
      queryClient.setQueryData(["schedule", "2026-08-31", "2026-09-01"], {
        trips: [],
      });

      await invalidateTripLifecycle(queryClient, TRIP_ID);

      const stale = queryClient
        .getQueryCache()
        .findAll({ queryKey: ["schedule"] })
        .map((query) => query.isStale());

      expect(stale).toEqual([true, true]);
    }));

  it("không đụng tới cache của chuyến khác", () =>
    withTestQueryClient(async (queryClient) => {
      const otherTripId = "72349dae-6303-4d74-8e89-4fcbd0fdaa2a";
      queryClient.setQueryData(["trip", TRIP_ID], { tripId: TRIP_ID });
      queryClient.setQueryData(["trip", otherTripId], { tripId: otherTripId });

      await invalidateTripLifecycle(queryClient, TRIP_ID);

      const other = queryClient
        .getQueryCache()
        .find({ queryKey: ["trip", otherTripId] });

      expect(other?.isStale()).toBe(false);
    }));
});
