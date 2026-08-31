import { localizeNotificationText } from "../notification-format";

describe("localizeNotificationText", () => {
  it("dịch nguyên câu BE gửi sẵn", () => {
    expect(localizeNotificationText("Có booking mới trên chuyến")).toBe(
      "Có vé mới trên chuyến",
    );
    expect(localizeNotificationText("Có đơn hàng cần check-in")).toBe(
      "Có kiện hàng cần nhận tại bến",
    );
  });

  it("thay theo từ và giữ nguyên mã vé", () => {
    expect(
      localizeNotificationText(
        "Booking VR-20260805-ABCDEFGH đã được xác nhận cho chuyến của bạn.",
      ),
    ).toBe("Vé VR-20260805-ABCDEFGH đã được xác nhận cho chuyến của bạn.");
  });

  it("check-in theo ngữ cảnh: hàng hóa vs vé", () => {
    expect(localizeNotificationText("Kiện PRC123456 chờ check-in")).toBe(
      "Kiện PRC123456 chờ nhận tại bến",
    );
    expect(localizeNotificationText("Khách chưa check-in")).toBe(
      "Khách chưa soát vé",
    );
  });

  it("trả chuỗi rỗng khi không có nội dung", () => {
    expect(localizeNotificationText(null)).toBe("");
    expect(localizeNotificationText(undefined)).toBe("");
  });
});
