import { destinationReconcileMeta } from "@/features/parcels/parcel-format";

// FE-PCL-004: bản E2E production 2026-08-31 bắt được card hiện "Xong, giao đủ
// kiện" ngay cạnh "Đã giao 0/5" vì nhãn map thẳng từ `canComplete`. Bộ test
// này khoá lại: chữ "giao đủ" CHỈ được xuất hiện khi thật sự giao đủ.
describe("destinationReconcileMeta", () => {
  it("giao đủ kiện, không còn kiện treo → thành công", () => {
    expect(
      destinationReconcileMeta({
        expectedCount: 5,
        scannedCount: 5,
        canComplete: true,
        unresolvedCount: 0,
      }),
    ).toEqual({ label: "Xong, giao đủ kiện", tone: "success", hint: null });
  });

  it("0/5 nhưng backend cho đóng chuyến → cảnh báo, KHÔNG báo giao đủ", () => {
    const meta = destinationReconcileMeta({
      expectedCount: 5,
      scannedCount: 0,
      canComplete: true,
      unresolvedCount: 5,
    });

    expect(meta.tone).toBe("warning");
    expect(meta.label).toBe("Đủ điều kiện hoàn tất với sự cố đã ghi nhận");
    expect(meta.label).not.toContain("giao đủ");
    expect(meta.hint).not.toBeNull();
  });

  it("2/5 nhưng backend cho đóng chuyến → vẫn là cảnh báo", () => {
    const meta = destinationReconcileMeta({
      expectedCount: 5,
      scannedCount: 2,
      canComplete: true,
      unresolvedCount: 3,
    });

    expect(meta.tone).toBe("warning");
    expect(meta.label).not.toContain("giao đủ");
  });

  it("chưa đủ và chưa được đóng chuyến → nguy hiểm", () => {
    expect(
      destinationReconcileMeta({
        expectedCount: 5,
        scannedCount: 2,
        canComplete: false,
        unresolvedCount: 3,
      }),
    ).toEqual({ label: "Còn kiện chưa giao", tone: "danger", hint: null });
  });

  it("đủ số nhưng vẫn còn kiện treo → không được báo giao đủ", () => {
    const meta = destinationReconcileMeta({
      expectedCount: 5,
      scannedCount: 5,
      canComplete: true,
      unresolvedCount: 1,
    });

    expect(meta.tone).toBe("warning");
    expect(meta.label).not.toContain("giao đủ");
  });

  it("cờ allDelivered của backend thắng suy luận theo số đếm", () => {
    // BE-PCL-004 trả allDelivered=false dù số đếm trông như đủ (ví dụ một kiện
    // được quét hai lần) → phải theo backend.
    expect(
      destinationReconcileMeta({
        expectedCount: 5,
        scannedCount: 5,
        canComplete: true,
        unresolvedCount: 0,
        allDelivered: false,
      }).tone,
    ).toBe("warning");

    expect(
      destinationReconcileMeta({
        expectedCount: 5,
        scannedCount: 4,
        canComplete: true,
        unresolvedCount: 0,
        allDelivered: true,
      }).label,
    ).toBe("Xong, giao đủ kiện");
  });

  it("chuyến không có kiện nào → nhãn trung tính, không khoe thành công", () => {
    const meta = destinationReconcileMeta({
      expectedCount: 0,
      scannedCount: 0,
      canComplete: true,
      unresolvedCount: 0,
    });

    expect(meta.label).toBe("Chuyến không có kiện");
    expect(meta.tone).toBe("neutral");
  });

  it("thiếu unresolvedCount (backend contract cũ) vẫn suy đúng theo số đếm", () => {
    expect(
      destinationReconcileMeta({
        expectedCount: 5,
        scannedCount: 5,
        canComplete: true,
      }).tone,
    ).toBe("success");

    expect(
      destinationReconcileMeta({
        expectedCount: 5,
        scannedCount: 0,
        canComplete: true,
      }).tone,
    ).toBe("warning");
  });
});
