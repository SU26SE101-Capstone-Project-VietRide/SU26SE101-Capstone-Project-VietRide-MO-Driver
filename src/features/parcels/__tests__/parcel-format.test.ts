import { isParcelCode } from "@/features/parcels/parcel-format";

describe("isParcelCode", () => {
  it("nhận mã kiện bản mới", () => {
    expect(isParcelCode("VR-PCL-20260831-QWWMK2LA")).toBe(true);
  });

  it("loại mã vé", () => {
    expect(isParcelCode("VT-20260831-ABCD1234")).toBe(false);
  });
});
