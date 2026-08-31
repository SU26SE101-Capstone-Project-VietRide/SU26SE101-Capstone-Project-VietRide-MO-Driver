import {
  actionFromPushData,
  approvalHrefFromUrl,
  invalidationKeysForAction,
  parcelApprovalHref,
  parseNotificationAction,
  resolveActionHref,
} from "@/features/notifications/notification-action";

// FE-PCL-003: bản E2E production 2026-08-31 — link phiếu duyệt mở Chrome thay
// vì mở VietRide, và thông báo không mang action mở được phiếu xin rời điểm
// (contract Phase 11 chỉ có OPEN_PARCEL_DETAIL kèm parcelId).
const PARCEL_ID = "3f6c1f2e-2b7c-4c1a-9c8d-1f0a5b6c7d8e";
const REQUEST_ID = "9a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d";

describe("parcelApprovalHref", () => {
  it("phiếu sự cố custody đi kèm parcelId", () => {
    expect(parcelApprovalHref(PARCEL_ID, null)).toBe(
      `/driver/parcel-approval?parcelId=${PARCEL_ID}`,
    );
  });

  it("phiếu xin rời điểm đi kèm requestId", () => {
    expect(parcelApprovalHref(null, REQUEST_ID)).toBe(
      `/driver/parcel-approval?requestId=${REQUEST_ID}`,
    );
  });

  it("có cả hai thì ưu tiên parcelId (đúng thứ tự màn phiếu đọc tham số)", () => {
    expect(parcelApprovalHref(PARCEL_ID, REQUEST_ID)).toContain(
      `parcelId=${PARCEL_ID}`,
    );
  });

  it("không có id nào thì không mở màn trống", () => {
    expect(parcelApprovalHref(null, null)).toBeNull();
  });
});

describe("resolveActionHref cho OPEN_PARCEL_APPROVAL", () => {
  it("tài xế mở được phiếu xin rời điểm từ thông báo", () => {
    const action = parseNotificationAction({
      type: "OPEN_PARCEL_APPROVAL",
      params: { requestId: REQUEST_ID },
    });

    expect(resolveActionHref(action, "DRIVER")).toBe(
      `/driver/parcel-approval?requestId=${REQUEST_ID}`,
    );
  });

  it("tài xế mở được phiếu sự cố custody từ thông báo", () => {
    const action = parseNotificationAction({
      type: "OPEN_PARCEL_APPROVAL",
      params: { parcelId: PARCEL_ID },
    });

    expect(resolveActionHref(action, "DRIVER")).toBe(
      `/driver/parcel-approval?parcelId=${PARCEL_ID}`,
    );
  });

  it("phụ xe KHÔNG có màn duyệt — không được tự duyệt phiếu mình tạo", () => {
    const action = parseNotificationAction({
      type: "OPEN_PARCEL_APPROVAL",
      params: { requestId: REQUEST_ID },
    });

    expect(resolveActionHref(action, "ASSISTANT")).toBeNull();
  });

  it("chưa đăng nhập thì không điều hướng đi đâu cả", () => {
    const action = parseNotificationAction({
      type: "OPEN_PARCEL_APPROVAL",
      params: { requestId: REQUEST_ID },
    });

    expect(resolveActionHref(action, null)).toBeNull();
  });
});

describe("actionFromPushData", () => {
  it("đọc actionType/actionParams mới của backend", () => {
    expect(
      actionFromPushData({
        actionType: "OPEN_PARCEL_APPROVAL",
        actionParams: JSON.stringify({ requestId: REQUEST_ID }),
      }),
    ).toEqual({
      type: "OPEN_PARCEL_APPROVAL",
      params: { requestId: REQUEST_ID },
    });
  });

  // Backend chưa bổ sung action type thì vẫn phải mở được phiếu, miễn payload
  // có id — nếu không thông báo duyệt phiếu là ngõ cụt.
  it("suy ra phiếu rời điểm từ approvalRequestId của payload legacy", () => {
    expect(
      actionFromPushData({
        type: "PARCEL_UPDATE",
        approvalRequestId: REQUEST_ID,
      }),
    ).toEqual({
      type: "OPEN_PARCEL_APPROVAL",
      params: { requestId: REQUEST_ID },
    });
  });

  it("suy ra phiếu sự cố từ custodyExceptionParcelId của payload legacy", () => {
    expect(
      actionFromPushData({ custodyExceptionParcelId: PARCEL_ID }),
    ).toEqual({
      type: "OPEN_PARCEL_APPROVAL",
      params: { parcelId: PARCEL_ID },
    });
  });

  it("payload kiện hàng thường vẫn về OPEN_PARCEL_DETAIL như cũ", () => {
    expect(
      actionFromPushData({ type: "PARCEL_UPDATE", parcelId: PARCEL_ID }),
    ).toEqual({ type: "OPEN_PARCEL_DETAIL", params: { parcelId: PARCEL_ID } });
  });
});

describe("approvalHrefFromUrl", () => {
  it.each([
    [
      "link https theo hình dạng API phiếu rời điểm",
      `https://vietride.online/crew/parcel-stop-departure-approvals/${REQUEST_ID}`,
      `/driver/parcel-approval?requestId=${REQUEST_ID}`,
    ],
    [
      "link https kèm hậu tố /decision",
      `https://vietride.online/parcel-stop-departure-approvals/${REQUEST_ID}/decision`,
      `/driver/parcel-approval?requestId=${REQUEST_ID}`,
    ],
    [
      "link https theo hình dạng API phiếu sự cố custody",
      `https://vietride.online/crew/parcels/${PARCEL_ID}/custody-exception`,
      `/driver/parcel-approval?parcelId=${PARCEL_ID}`,
    ],
    [
      "link scheme riêng của app",
      `vietride://driver/parcel-approval?requestId=${REQUEST_ID}`,
      `/driver/parcel-approval?requestId=${REQUEST_ID}`,
    ],
    [
      "link https trỏ thẳng route của app",
      `https://vietride.online/driver/parcel-approval?parcelId=${PARCEL_ID}`,
      `/driver/parcel-approval?parcelId=${PARCEL_ID}`,
    ],
  ])("%s", (_name, url, expected) => {
    expect(approvalHrefFromUrl(url)).toBe(expected);
  });

  it.each([
    ["link đặt lại mật khẩu", "https://vietride.online/auth/set-password?token=x"],
    ["link ngoài luồng", "https://example.com/whatever"],
    ["chuỗi rỗng", ""],
    ["null", null],
    ["undefined", undefined],
  ])("%s không bị nhận nhầm là phiếu duyệt", (_name, url) => {
    expect(approvalHrefFromUrl(url)).toBeNull();
  });

  it("id không phải UUID thì bỏ qua, không dựng route rác", () => {
    expect(
      approvalHrefFromUrl(
        "https://vietride.online/parcel-stop-departure-approvals/abc",
      ),
    ).toBeNull();
  });
});

describe("invalidationKeysForAction cho phiếu duyệt", () => {
  it("làm mới chi tiết phiếu rời điểm", () => {
    const keys = invalidationKeysForAction({
      type: "OPEN_PARCEL_APPROVAL",
      params: { requestId: REQUEST_ID },
    });

    expect(keys).toContainEqual([
      "parcel-stop-departure-approval",
      REQUEST_ID,
    ]);
  });

  it("làm mới chi tiết phiếu sự cố custody", () => {
    const keys = invalidationKeysForAction({
      type: "OPEN_PARCEL_APPROVAL",
      params: { parcelId: PARCEL_ID },
    });

    expect(keys).toContainEqual(["parcel-custody-exception", PARCEL_ID]);
  });
});
