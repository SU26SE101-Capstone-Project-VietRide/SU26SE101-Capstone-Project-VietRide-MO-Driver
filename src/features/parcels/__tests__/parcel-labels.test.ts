import {
  CUSTODY_APPROVAL_STATUSES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  PARCEL_STATUSES,
  custodyApprovalStatusLabel,
  incidentStatusLabel,
  incidentTypeLabel,
  parcelStatusMeta,
} from "@/features/parcels/parcel-format";

// Đây là app tiếng Việt: enum thô của backend lọt lên màn hình là bug, không
// phải chuyện nhỏ. Enum lọt ra không crash, không làm test khác đỏ, nên nó
// lặng lẽ trôi tới tay phụ xe rồi mới bị phát hiện — bộ test này là lưới chắn.
//
// Cách dùng khi backend thêm enum mới: thêm giá trị vào mảng hằng trong
// parcel-format.ts, `tsc` sẽ bắt thiếu label ngay, và test dưới đây khoá lại
// rằng label mới không phải chữ fallback.

// Chữ fallback của từng hàm — dùng để khẳng định enum đã biết KHÔNG rơi vào đó.
const FALLBACKS = {
  parcelStatus: "Không rõ trạng thái",
  incidentType: "Sự cố kiện",
  incidentStatus: "Chưa rõ trạng thái",
  custodyApprovalStatus: "Chưa rõ trạng thái duyệt",
};

// Chỉ chấp nhận chữ cái tiếng Việt/khoảng trắng/dấu câu. Enum backend viết
// HOA_CÓ_GẠCH_DƯỚI nên mẫu này bắt được ngay khi nó lọt ra.
const LOOKS_LIKE_ENUM = /^[A-Z0-9_]+$/;

function expectVietnameseLabel(label: string, fallback: string) {
  expect(label.length).toBeGreaterThan(0);
  expect(label).not.toBe(fallback);
  expect(label).not.toMatch(LOOKS_LIKE_ENUM);
}

describe("parcelStatusMeta", () => {
  it.each(PARCEL_STATUSES)("map %s sang nhãn tiếng Việt", (status) => {
    expectVietnameseLabel(parcelStatusMeta(status).label, FALLBACKS.parcelStatus);
  });

  it("giá trị lạ vẫn ra câu tiếng Việt, không lòi enum", () => {
    expect(parcelStatusMeta("SOME_NEW_BACKEND_STATUS")).toEqual({
      label: FALLBACKS.parcelStatus,
      tone: "neutral",
    });
  });

  it("null/undefined/chuỗi rỗng cũng ra câu tiếng Việt", () => {
    for (const value of [null, undefined, ""]) {
      expect(parcelStatusMeta(value).label).toBe(FALLBACKS.parcelStatus);
    }
  });

  it("không có hai trạng thái nào trùng nhãn (crew phải phân biệt được)", () => {
    const labels = PARCEL_STATUSES.map((s) => parcelStatusMeta(s).label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("incidentTypeLabel", () => {
  it.each(INCIDENT_TYPES)("map %s sang nhãn tiếng Việt", (type) => {
    expectVietnameseLabel(incidentTypeLabel(type), FALLBACKS.incidentType);
  });

  it("giá trị lạ ra câu chung chung, không lòi enum", () => {
    expect(incidentTypeLabel("BRAND_NEW_INCIDENT")).toBe(
      FALLBACKS.incidentType,
    );
  });
});

describe("incidentStatusLabel", () => {
  it.each(INCIDENT_STATUSES)("map %s sang nhãn tiếng Việt", (status) => {
    expectVietnameseLabel(incidentStatusLabel(status), FALLBACKS.incidentStatus);
  });

  // FE-PCL-006: kiện VR-PCL-20260831-QWWMK2LA của lần chạy E2E production hiện
  // "Chưa rõ trạng thái" dù FORWARDING là trạng thái hợp lệ của Flow H.
  it("FORWARDING nói rõ kiện đang được chuyển sang chuyến khác", () => {
    const label = incidentStatusLabel("FORWARDING");

    expect(label).not.toBe(FALLBACKS.incidentStatus);
    expect(label).toContain("chuyến khác");
  });

  it("giá trị lạ ra câu chung chung, không lòi enum", () => {
    expect(incidentStatusLabel("BRAND_NEW_STATUS")).toBe(
      FALLBACKS.incidentStatus,
    );
  });
});

describe("custodyApprovalStatusLabel", () => {
  it.each(CUSTODY_APPROVAL_STATUSES)(
    "map %s sang nhãn tiếng Việt",
    (status) => {
      expectVietnameseLabel(
        custodyApprovalStatusLabel(status),
        FALLBACKS.custodyApprovalStatus,
      );
    },
  );

  it("giá trị lạ ra câu chung chung, không lòi enum", () => {
    expect(custodyApprovalStatusLabel("BRAND_NEW_APPROVAL")).toBe(
      FALLBACKS.custodyApprovalStatus,
    );
  });
});

describe("cảnh báo dev khi gặp enum lạ", () => {
  it("log ra console.warn để còn biết mà bổ sung label", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    parcelStatusMeta("SOME_NEW_BACKEND_STATUS");

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("SOME_NEW_BACKEND_STATUS"),
    );
  });

  it("không log khi giá trị là null/rỗng (backend đơn giản là không gửi)", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    parcelStatusMeta(null);
    parcelStatusMeta("");

    expect(warn).not.toHaveBeenCalled();
  });
});
