import { tripCompletionBlocker } from "@/features/trip-ops/trip-completion";

// FE-PCL-008: nút "Hoàn tất chuyến" trước đây luôn bật ở mọi chuyến
// IN_PROGRESS; chưa tới bến cuối thì app chỉ hỏi lại một câu destructive rồi
// vẫn gửi. Bộ test này khoá lại: thiếu bước nào thì nút phải bị chặn kèm câu
// nói rõ bước đó.
describe("tripCompletionBlocker", () => {
  const ARRIVED_AT = "2026-08-31T03:58:00Z";

  it("đang chạy và đã tới bến cuối → không chặn", () => {
    expect(
      tripCompletionBlocker({
        status: "IN_PROGRESS",
        destinationArrivedAt: ARRIVED_AT,
      }),
    ).toBeNull();
  });

  it("đang chạy nhưng chưa tới bến cuối → chặn", () => {
    const blocker = tripCompletionBlocker({
      status: "IN_PROGRESS",
      destinationArrivedAt: null,
    });

    expect(blocker?.code).toBe("DESTINATION_NOT_ARRIVED");
  });

  it("backend không gửi mốc tới bến (undefined) cũng bị chặn", () => {
    expect(
      tripCompletionBlocker({
        status: "IN_PROGRESS",
        destinationArrivedAt: undefined,
      })?.code,
    ).toBe("DESTINATION_NOT_ARRIVED");
  });

  it.each(["BOARDING", "SCHEDULED", "COMPLETED", "CANCELLED"])(
    "chuyến ở trạng thái %s thì chặn vì chưa/không còn chạy",
    (status) => {
      expect(
        tripCompletionBlocker({ status, destinationArrivedAt: ARRIVED_AT })
          ?.code,
      ).toBe("NOT_IN_PROGRESS");
    },
  );

  it("chưa chọn được chuyến (status null) thì chặn", () => {
    expect(
      tripCompletionBlocker({ status: null, destinationArrivedAt: null })?.code,
    ).toBe("NOT_IN_PROGRESS");
  });

  it("lý do luôn là câu tiếng Việt, không lòi enum backend", () => {
    const reasons = [
      tripCompletionBlocker({ status: "BOARDING", destinationArrivedAt: null }),
      tripCompletionBlocker({
        status: "IN_PROGRESS",
        destinationArrivedAt: null,
      }),
    ].map((blocker) => blocker?.reason ?? "");

    for (const reason of reasons) {
      expect(reason.length).toBeGreaterThan(0);
      expect(reason).not.toMatch(/[A-Z_]{4,}/);
    }
  });
});
