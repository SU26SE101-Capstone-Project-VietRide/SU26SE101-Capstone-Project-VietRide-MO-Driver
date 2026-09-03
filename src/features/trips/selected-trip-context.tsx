import {
    createContext,
    useContext,
    useMemo,
    useState,
    type PropsWithChildren,
} from "react";

import type { ScheduleTrip } from "@/api/types";
import { isoDateOf } from "@/features/trips/trip-format";
import { useActiveTrip, useDriverSchedule } from "@/features/trips/use-trips";

// Chuyến mà các màn vận hành đang thao tác.
//
// Trước đây mỗi màn tự gọi useActiveTrip() và tự đoán chuyến theo cùng một công
// thức, nên crew chạy nhiều ca/ngày KHÔNG có cách nào làm việc với ca khác —
// app chọn hộ một chuyến và khóa ở đó. Giờ lựa chọn nằm ở một chỗ duy nhất và
// dùng chung cho mọi màn: chọn chuyến ở màn Đón khách thì màn Điểm dừng, Hàng
// ký gửi… cũng theo, không lệch nhau.
//
// Mặc định vẫn là chuyến useActiveTrip() đoán ra, nên khi crew chỉ có một ca
// thì trải nghiệm không đổi.

type SelectedTripContextValue = {
  tripId: string | null;
  trip: ScheduleTrip | null;
  // Các chuyến trong cửa sổ hiển thị (hôm nay + rạng sáng mai) để dựng bộ
  // chọn. Rỗng khi lịch chưa tải xong.
  trips: ScheduleTrip[];
  // Ca đã được phân công nhưng còn NGOÀI cửa sổ trên (điển hình: tuyến vừa
  // được giao cho ngày mai). Các màn vận hành dùng nó để nói rõ "chưa tới giờ"
  // thay vì để crew hiểu là app chưa nhận được tuyến. `null` khi không có.
  nextAssignedTrip: ScheduleTrip | null;
  selectTrip: (tripId: string) => void;
  // Bỏ lựa chọn thủ công, quay về chuyến app tự xác định.
  clearSelection: () => void;
  isManualSelection: boolean;
  isLoading: boolean;
  isError: boolean;
  // Giữ cùng shape với useActiveTrip cũ để pull-to-refresh của các màn vận
  // hành gọi thẳng được, không phải sửa từng chỗ.
  refetch: () => Promise<unknown>;
};

const SelectedTripContext = createContext<SelectedTripContextValue | null>(null);

// Ca đêm cần thấy cả chuyến rạng sáng hôm sau: chuyến 00:20 ngày 12 phải soát
// vé từ tối muộn ngày 11 (mở bến ~30 phút trước), không thể bắt phụ xe chờ qua
// 0h mới thấy chip. Cùng hướng tiếp cận với useActiveTrip (nhìn lui hôm qua cho
// chuyến xuyên đêm), ở đây nhìn TỚI TRƯỚC: lấy thêm chuyến ngày mai khởi hành
// trước ngưỡng giờ này.
const NEXT_DAY_CUTOFF_HOUR = 1;

export function SelectedTripProvider({ children }: PropsWithChildren) {
  const now = new Date();
  const today = isoDateOf(now);
  const tomorrow = isoDateOf(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  // Tách từng field ra biến riêng: useMemo phụ thuộc vào chúng chứ không vào
  // object query (object đổi tham chiếu mỗi render, memo sẽ vô nghĩa).
  const {
    trip: active,
    isLoading: activeLoading,
    isError: activeError,
    refetch: refetchActive,
  } = useActiveTrip();
  const {
    data: scheduleData,
    isLoading: scheduleLoading,
    isError: scheduleError,
    refetch: refetchSchedule,
  } = useDriverSchedule(today, tomorrow);

  const value = useMemo<SelectedTripContextValue>(() => {
    // Khung truy vấn là (hôm nay, ngày mai) nhưng chỉ giữ: toàn bộ chuyến hôm
    // nay + chuyến rạng sáng mai trước NEXT_DAY_CUTOFF_HOUR. Các chuyến còn lại
    // của ngày mai vẫn ẩn — sang ngày mới cửa sổ tự dịch theo.
    const cutoff = new Date(
      `${tomorrow}T0${NEXT_DAY_CUTOFF_HOUR}:00:00`,
    ).getTime();
    // Chốt "bây giờ" một lần mỗi khi data đổi, cùng cách useActiveTrip làm —
    // không gọi Date.now() rải rác trong lúc render.
    const nowMs = new Date().getTime();
    const todayTrips = (scheduleData?.trips ?? [])
      .filter((item) => {
        const departure = new Date(item.departureDateTime);
        return (
          isoDateOf(departure) === today || departure.getTime() <= cutoff
        );
      })
      // Giữ sắp xếp theo giờ khởi hành để chip rạng sáng nằm cuối danh sách ca đêm.
      .sort(
        (a, b) =>
          new Date(a.departureDateTime).getTime() -
          new Date(b.departureDateTime).getTime(),
      );

    // Chuyến đêm khởi hành hôm qua nhưng còn đang chạy nằm ngoài lịch hôm nay
    // → ghép thêm vào để bộ chọn vẫn hiện nó, không thì crew đang chạy chuyến
    // đó lại không có chip nào sáng và không quay về được sau khi bấm ca khác.
    const trips =
      active && !todayTrips.some((item) => item.tripId === active.tripId)
        ? [active, ...todayTrips].sort(
            (a, b) =>
              new Date(a.departureDateTime).getTime() -
              new Date(b.departureDateTime).getTime(),
          )
        : todayTrips;

    // Lựa chọn cũ có thể trỏ tới chuyến không còn trong lịch (đổi ngày, bị hủy
    // phân công) → bỏ qua, không giữ một tripId mồ côi.
    const selected = selectedTripId
      ? (trips.find((item) => item.tripId === selectedTripId) ?? null)
      : null;

    const trip = selected ?? active ?? trips[0] ?? null;

    // Ca đã phân công nhưng chưa vào cửa sổ (ngày mai sau NEXT_DAY_CUTOFF_HOUR).
    // Lấy sẵn từ CHÍNH `scheduleData` đang có — khung truy vấn đã là (hôm nay,
    // ngày mai) nên không thêm request nào. Có nó thì màn vận hành nói được
    // "ca kế tiếp: …" thay vì chỉ "chưa có chuyến", vốn khiến crew tưởng app
    // chưa nhận được tuyến vừa được giao.
    const inWindow = new Set(trips.map((item) => item.tripId));
    const nextAssignedTrip =
      (scheduleData?.trips ?? [])
        .filter(
          (item) =>
            !inWindow.has(item.tripId) &&
            new Date(item.departureDateTime).getTime() > nowMs,
        )
        .sort(
          (a, b) =>
            new Date(a.departureDateTime).getTime() -
            new Date(b.departureDateTime).getTime(),
        )[0] ?? null;

    return {
      tripId: trip?.tripId ?? null,
      trip,
      trips,
      nextAssignedTrip,
      selectTrip: setSelectedTripId,
      clearSelection: () => setSelectedTripId(null),
      isManualSelection: selected != null,
      isLoading: activeLoading || scheduleLoading,
      isError: activeError || scheduleError,
      refetch: () => Promise.all([refetchActive(), refetchSchedule()]),
    };
  }, [
    active,
    activeLoading,
    activeError,
    refetchActive,
    scheduleData,
    scheduleLoading,
    scheduleError,
    refetchSchedule,
    selectedTripId,
    today,
    tomorrow,
  ]);

  return (
    <SelectedTripContext.Provider value={value}>
      {children}
    </SelectedTripContext.Provider>
  );
}

export function useSelectedTrip(): SelectedTripContextValue {
  const context = useContext(SelectedTripContext);

  if (!context) {
    throw new Error("useSelectedTrip requires SelectedTripProvider");
  }

  return context;
}
