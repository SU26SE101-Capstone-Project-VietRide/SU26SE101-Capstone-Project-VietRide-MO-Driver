import type { TripDetails } from "@/api/types";
import { normalizeTripStatus } from "@/features/trips/trip-format";

// Điều kiện tiên quyết để hoàn tất chuyến — FE-PCL-008.
//
// Trước đây mọi chuyến IN_PROGRESS đều hiện nút "Hoàn tất chuyến" bật sẵn;
// chưa ghi nhận tới bến cuối thì app chỉ bung một Alert destructive rồi VẪN
// cho gửi. Nghĩa là tài xế đóng được chuyến trước khi vòng đời tuyến khép lại,
// và cái Alert đó dạy người dùng bấm bừa qua cảnh báo.
//
// Nguyên tắc thay thế: nút bị KHOÁ và app nói rõ đang thiếu bước nào, thay vì
// hỏi "vẫn hoàn tất?". Backend (BE-PCL-005) vẫn là nơi cưỡng chế bất biến —
// phần này chỉ để crew không rơi vào thế bấm rồi mới ăn lỗi.

export type TripCompletionBlocker = {
  // Mã để test và log bám vào; không hiển thị cho người dùng.
  code: "NOT_IN_PROGRESS" | "DESTINATION_NOT_ARRIVED";
  // Câu tiếng Việt nói đúng bước còn thiếu.
  reason: string;
};

type TripCompletionInput = {
  // Status lấy từ ScheduleTrip (nguồn mà màn tài xế đang dùng), không phải từ
  // trip detail — hai nguồn có thể lệch nhau một nhịp.
  status: string | null | undefined;
  destinationArrivedAt: TripDetails["destinationArrivedAt"];
};

// null = đủ điều kiện bấm hoàn tất.
export function tripCompletionBlocker(
  input: TripCompletionInput,
): TripCompletionBlocker | null {
  if (normalizeTripStatus(input.status) !== "IN_PROGRESS") {
    return {
      code: "NOT_IN_PROGRESS",
      reason: "Chuyến chưa khởi hành nên chưa hoàn tất được.",
    };
  }

  if (input.destinationArrivedAt == null) {
    return {
      code: "DESTINATION_NOT_ARRIVED",
      reason:
        "Chưa ghi nhận xe tới bến cuối. Bấm “Đã tới bến cuối” và đối soát kiện xong thì nút này mở.",
    };
  }

  return null;
}
