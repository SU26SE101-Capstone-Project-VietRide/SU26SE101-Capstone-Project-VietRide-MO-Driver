import {
  shuttleDirectionLabelOf,
  shuttleStopStatusOf,
  shuttleTripStatusOf,
} from "@/features/shuttle/shuttle-format";

// Đây là app tiếng Việt: enum thô của backend lòi lên màn hình là bug. Ba hàm
// dưới đây trước kia trả nguyên `status`/`direction` ở nhánh default, nên một
// giá trị mới của backend là đủ để chip trạng thái chuyến trung chuyển hiện chữ
// in hoa kiểu "SHUTTLE_DELAYED" cho tài xế đọc.
describe("nhãn trung chuyển luôn là tiếng Việt", () => {
  it("map đủ trạng thái chuyến trung chuyển", () => {
    expect(shuttleTripStatusOf("SCHEDULED").label).toBe("Chờ khởi hành");
    expect(shuttleTripStatusOf("IN_PROGRESS").label).toBe("Đang chạy");
    expect(shuttleTripStatusOf("COMPLETED").label).toBe("Hoàn tất");
    expect(shuttleTripStatusOf("CANCELLED").label).toBe("Đã hủy");
  });

  it("map đủ trạng thái điểm đón", () => {
    expect(shuttleStopStatusOf("PENDING").label).toBe("Chờ đón");
    expect(shuttleStopStatusOf("PICKED_UP").label).toBe("Đã đón");
    expect(shuttleStopStatusOf("DELIVERED").label).toBe("Đã trả khách");
    expect(shuttleStopStatusOf("NO_SHOW").label).toBe("Vắng mặt");
    expect(shuttleStopStatusOf("CANCELLED").label).toBe("Đã hủy");
  });

  it("map đủ chiều chạy", () => {
    expect(shuttleDirectionLabelOf("INBOUND_TO_STATION")).toBe(
      "Đón khách về bến",
    );
    expect(shuttleDirectionLabelOf("OUTBOUND_FROM_STATION")).toBe(
      "Trả khách từ bến",
    );
  });

  it("giá trị lạ ra câu tiếng Việt, không lòi enum", () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});

    expect(shuttleTripStatusOf("SHUTTLE_DELAYED").label).toBe(
      "Không rõ trạng thái",
    );
    expect(shuttleStopStatusOf("SKIPPED").label).toBe("Không rõ trạng thái");
    expect(shuttleDirectionLabelOf("ROUND_TRIP")).toBe("Chuyến trung chuyển");
  });

  it("vẫn log ra console để còn biết mà bổ sung label", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    shuttleTripStatusOf("SHUTTLE_DELAYED");

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("SHUTTLE_DELAYED"),
    );
  });
});
