import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";

import {
  arriveAtDestination,
  arriveAtStop,
  completeTrip,
  reportIncident,
} from "@/api/driver-ops";
import type { ReportIncidentInput } from "@/api/types";

// Sau khi xác nhận tới nơi phải làm mới hai thứ:
// - chi tiết chuyến: lấy stops[].status và destinationArrivedAt mới từ backend
//   (backend là nguồn trạng thái duy nhất);
// - danh sách kiện: thao tác dỡ kiện vừa được mở khoá.
function useAfterArrival(tripId: string | null) {
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["trip", tripId] }),
      queryClient.invalidateQueries({ queryKey: ["assistant-parcels", tripId] }),
    ]);
  };
}

// Xác nhận xe đã đến một điểm dừng.
export function useArriveAtStop(tripId: string | null) {
  const afterArrival = useAfterArrival(tripId);

  return useMutation({
    mutationFn: (stopId: string) => arriveAtStop(tripId as string, stopId),
    onSuccess: afterArrival,
  });
}

// Xác nhận xe đã tới bến cuối. KHÔNG hoàn tất chuyến.
export function useArriveAtDestination(tripId: string | null) {
  const afterArrival = useAfterArrival(tripId);

  return useMutation({
    mutationFn: () => arriveAtDestination(tripId as string),
    onSuccess: afterArrival,
  });
}

// Hoàn tất chuyến. Làm mới lịch + chi tiết chuyến vì trạng thái đổi.
export function useCompleteTrip(tripId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => completeTrip(tripId as string),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["schedule"] }),
        queryClient.invalidateQueries({ queryKey: ["trip", tripId] }),
      ]);
    },
  });
}

// Báo sự cố. Không đụng tới cache chuyến vì incident không làm đổi Trip.
export function useReportIncident(tripId: string | null) {
  return useMutation({
    mutationFn: (input: ReportIncidentInput) =>
      reportIncident(tripId as string, input),
  });
}

// Lấy toạ độ hiện tại cho báo sự cố, best-effort.
// Từ chối quyền hoặc lấy không được thì trả null — backend cho phép gửi thiếu
// toạ độ, không được vì thế mà chặn tài xế báo sự cố.
export async function getCurrentCoords(): Promise<{
  latitude: number;
  longitude: number;
} | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      return null;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch {
    return null;
  }
}
