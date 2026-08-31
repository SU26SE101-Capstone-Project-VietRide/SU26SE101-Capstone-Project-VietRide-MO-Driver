import { renderHook, act } from "@testing-library/react-native";

import {
  EMPTY_DEPARTED_STOPS,
  isStopDeparted,
  markStopDeparted,
  useDepartedStops,
} from "@/features/trip-ops/departed-stops";

// Dữ liệu thật của lần chạy E2E production PCL-LIVE-20260830-164823-0a6996:
// hai chuyến dùng chung route b06b11b5 nên dùng chung luôn stopId.
const TRIP_A = "b31a345e-255a-4d0f-8f48-0fb3af9c3d17";
const TRIP_B = "72349dae-6303-4d74-8e89-4fcbd0fdaa2a";
const STOP_CAT_LAI = "082c5a49-75c8-423f-b7ff-85d925d887e8";
const STOP_THU_DUC = "a6c4b468-db80-49c7-a070-f8f81e421005";

describe("markStopDeparted / isStopDeparted", () => {
  it("ghi nhận điểm vừa chốt rời của đúng chuyến", () => {
    const cache = markStopDeparted(
      EMPTY_DEPARTED_STOPS,
      TRIP_A,
      STOP_CAT_LAI,
    );

    expect(isStopDeparted(cache, TRIP_A, STOP_CAT_LAI)).toBe(true);
  });

  // Đây chính là FE-PCL-001.
  it("KHÔNG rò trạng thái sang chuyến khác dùng chung stopId", () => {
    const cache = markStopDeparted(
      EMPTY_DEPARTED_STOPS,
      TRIP_A,
      STOP_CAT_LAI,
    );

    expect(isStopDeparted(cache, TRIP_B, STOP_CAT_LAI)).toBe(false);
  });

  it("đổi chuyến rồi chốt điểm thì vứt hẳn cache của chuyến cũ", () => {
    let cache = markStopDeparted(EMPTY_DEPARTED_STOPS, TRIP_A, STOP_CAT_LAI);
    cache = markStopDeparted(cache, TRIP_B, STOP_THU_DUC);

    expect(cache.tripId).toBe(TRIP_B);
    expect(cache.stopIds).toEqual([STOP_THU_DUC]);
    expect(isStopDeparted(cache, TRIP_A, STOP_CAT_LAI)).toBe(false);
  });

  it("cộng dồn nhiều điểm trong cùng một chuyến", () => {
    let cache = markStopDeparted(EMPTY_DEPARTED_STOPS, TRIP_A, STOP_CAT_LAI);
    cache = markStopDeparted(cache, TRIP_A, STOP_THU_DUC);

    expect(isStopDeparted(cache, TRIP_A, STOP_CAT_LAI)).toBe(true);
    expect(isStopDeparted(cache, TRIP_A, STOP_THU_DUC)).toBe(true);
  });

  it("ghi lại cùng một điểm không tạo object mới (khỏi re-render thừa)", () => {
    const cache = markStopDeparted(EMPTY_DEPARTED_STOPS, TRIP_A, STOP_CAT_LAI);

    expect(markStopDeparted(cache, TRIP_A, STOP_CAT_LAI)).toBe(cache);
  });

  it("chưa chọn chuyến thì không ghi gì, và không khớp với chuyến nào", () => {
    const cache = markStopDeparted(EMPTY_DEPARTED_STOPS, null, STOP_CAT_LAI);

    expect(cache).toBe(EMPTY_DEPARTED_STOPS);
    expect(isStopDeparted(cache, null, STOP_CAT_LAI)).toBe(false);
  });
});

describe("useDepartedStops", () => {
  // RNTL v14: renderHook và rerender đều async.
  const mount = () =>
    renderHook(
      ({ tripId }: { tripId: string | null }) => useDepartedStops(tripId),
      { initialProps: { tripId: TRIP_A as string | null } },
    );

  it("chốt rời ở chuyến A rồi đổi sang chuyến B thì B vẫn còn nút rời điểm", async () => {
    const { result, rerender } = await mount();

    await act(async () => result.current.markDeparted(STOP_CAT_LAI));
    expect(result.current.isDeparted(STOP_CAT_LAI)).toBe(true);

    await rerender({ tripId: TRIP_B });
    expect(result.current.isDeparted(STOP_CAT_LAI)).toBe(false);
  });

  it("quay lại chuyến A không hồi sinh cache đã bị chuyến B thay", async () => {
    const { result, rerender } = await mount();

    await act(async () => result.current.markDeparted(STOP_CAT_LAI));
    await rerender({ tripId: TRIP_B });
    await act(async () => result.current.markDeparted(STOP_THU_DUC));
    await rerender({ tripId: TRIP_A });

    // Trạng thái đúng phải đến từ `actualDepartureTime` của server, không
    // phải từ phiên trước trên máy.
    expect(result.current.isDeparted(STOP_CAT_LAI)).toBe(false);
  });

  it("markDeparted ghi vào chuyến đang chọn tại thời điểm bấm", async () => {
    const { result, rerender } = await mount();

    await rerender({ tripId: TRIP_B });
    await act(async () => result.current.markDeparted(STOP_CAT_LAI));

    expect(result.current.isDeparted(STOP_CAT_LAI)).toBe(true);
  });
});
