import {
  actionFromPushData,
  invalidationKeysForAction,
} from "../notification-action";

// Được giao tuyến giữa ca mà lịch không tự làm mới là lý do crew phải
// logout/login mới thấy chuyến mới. `schedule` là key duy nhất chứa danh sách
// ca (màn Lịch làm việc, bộ chọn chuyến và useActiveTrip cùng đọc), nên nó phải
// nằm trong danh sách invalidate của push giao/đổi chuyến.

const TRIP_ID = "6230e4c8-c160-4e90-942f-7197e14d9991";

describe("invalidationKeysForAction làm mới lịch làm việc", () => {
  it("push TRIP_ASSIGNED làm mới schedule", () => {
    const action = actionFromPushData({ type: "TRIP_ASSIGNED", tripId: TRIP_ID });

    expect(invalidationKeysForAction(action)).toContainEqual(["schedule"]);
  });

  it("push TRIP_UPDATE làm mới schedule", () => {
    const action = actionFromPushData({ type: "TRIP_UPDATE", tripId: TRIP_ID });

    expect(invalidationKeysForAction(action)).toContainEqual(["schedule"]);
  });

  it("vẫn giữ các key theo chuyến đã có trước đó", () => {
    const keys = invalidationKeysForAction({
      type: "OPEN_TRIP_DETAIL",
      params: { tripId: TRIP_ID },
    });

    expect(keys).toContainEqual(["trip", TRIP_ID]);
    expect(keys).toContainEqual(["manifest", TRIP_ID]);
    expect(keys).toContainEqual(["seat-map", TRIP_ID]);
    expect(keys).toContainEqual(["trip-route-geometry", TRIP_ID]);
  });

  it("push kiện hàng KHÔNG làm mới schedule — phân công không đổi", () => {
    const keys = invalidationKeysForAction({
      type: "OPEN_PARCEL_DETAIL",
      params: { parcelId: "9f2c" },
    });

    expect(keys).not.toContainEqual(["schedule"]);
  });
});
