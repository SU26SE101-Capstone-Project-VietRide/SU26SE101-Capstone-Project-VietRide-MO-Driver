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
  // Các chuyến trong ngày để dựng bộ chọn. Rỗng khi lịch chưa tải xong.
  trips: ScheduleTrip[];
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

export function SelectedTripProvider({ children }: PropsWithChildren) {
  const today = isoDateOf(new Date());
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
  } = useDriverSchedule(today, today);

  const value = useMemo<SelectedTripContextValue>(() => {
    const todayTrips = scheduleData?.trips ?? [];

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

    return {
      tripId: trip?.tripId ?? null,
      trip,
      trips,
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
