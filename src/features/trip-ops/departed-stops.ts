import { useCallback, useState } from "react";

// Cache "điểm đã chốt rời trong phiên này" — FE-PCL-001.
//
// Vì sao vẫn cần cache cục bộ: backend có thể chưa trả `actualDepartureTime`
// trong trip detail (BE-PCL-001). Không có nó thì nút "Rời điểm này" đứng
// nguyên sau khi bấm, trông như không có gì xảy ra, và crew bấm lại sẽ ăn 409
// TRIP_STOP_ALREADY_DEPARTED.
//
// Vì sao PHẢI khoá theo tripId: bản E2E production 2026-08-31 cho hai chuyến
// (chuyến gốc và chuyến trung chuyển) dùng CHUNG một route và CHUNG các stopId.
// Cache chỉ khoá theo stopId nên sau khi chốt rời Cát Lái ở chuyến A rồi đổi
// sang chuyến B, chuyến B hiện luôn "đã rời điểm" và mất nút `Rời điểm này` —
// crew đi tiếp mà không ghi nhận rời điểm cho chuyến đang chạy, kéo theo uỷ
// quyền dỡ hàng dùng sai vị trí vận hành.
//
// Đây là workaround tạm. Khi BE-PCL-001 trả `actualDepartureTime` bền vững thì
// xoá hẳn module này, đừng nới thêm phạm vi cho nó.
export type DepartedStopsCache = {
  // Chuyến mà các stopId dưới đây thuộc về. null = chưa chốt điểm nào.
  tripId: string | null;
  stopIds: readonly string[];
};

export const EMPTY_DEPARTED_STOPS: DepartedStopsCache = {
  tripId: null,
  stopIds: [],
};

// Ghi nhận một điểm vừa chốt rời. Đổi chuyến thì vứt toàn bộ cache cũ thay vì
// gộp thêm — trạng thái của chuyến khác không bao giờ được suy sang chuyến này.
export function markStopDeparted(
  cache: DepartedStopsCache,
  tripId: string | null,
  stopId: string,
): DepartedStopsCache {
  // Không biết đang ở chuyến nào thì không được ghi gì cả: ghi vào sẽ tạo ra
  // một cache mồ côi có thể khớp nhầm khi tripId về sau.
  if (tripId == null) {
    return cache;
  }

  if (cache.tripId !== tripId) {
    return { tripId, stopIds: [stopId] };
  }

  if (cache.stopIds.includes(stopId)) {
    return cache;
  }

  return { tripId, stopIds: [...cache.stopIds, stopId] };
}

// Chỉ đúng khi cache thuộc về đúng chuyến đang hỏi.
export function isStopDeparted(
  cache: DepartedStopsCache,
  tripId: string | null,
  stopId: string,
): boolean {
  if (tripId == null || cache.tripId !== tripId) {
    return false;
  }
  return cache.stopIds.includes(stopId);
}

export type DepartedStops = {
  isDeparted: (stopId: string) => boolean;
  markDeparted: (stopId: string) => void;
};

// Hook dùng trong màn điểm dừng. Không cần useEffect để reset khi đổi chuyến:
// `isStopDeparted` đã tự loại cache của chuyến khác, còn lần ghi kế tiếp thay
// luôn cache cũ.
export function useDepartedStops(tripId: string | null): DepartedStops {
  const [cache, setCache] = useState<DepartedStopsCache>(EMPTY_DEPARTED_STOPS);

  const isDeparted = useCallback(
    (stopId: string) => isStopDeparted(cache, tripId, stopId),
    [cache, tripId],
  );

  // Phụ thuộc tripId nên callback đổi tham chiếu khi đổi chuyến — đúng ý đồ:
  // lần bấm nào cũng ghi vào chuyến đang chọn tại thời điểm đó.
  const markDeparted = useCallback(
    (stopId: string) => {
      setCache((current) => markStopDeparted(current, tripId, stopId));
    },
    [tripId],
  );

  return { isDeparted, markDeparted };
}
