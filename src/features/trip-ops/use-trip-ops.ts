import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { Linking } from "react-native";

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
// Trạng thái quyền vị trí để form báo sự cố nói rõ báo cáo có kèm toạ độ hay
// không, thay vì tới lúc gửi mới âm thầm bỏ qua vị trí.
export function useLocationPermission() {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    let alive = true;
    // getForegroundPermissionsAsync chỉ ĐỌC trạng thái, không bật hộp thoại xin
    // quyền — hộp thoại chỉ hiện khi người dùng chủ động chạm.
    void Location.getForegroundPermissionsAsync()
      .then((permission) => {
        if (alive) {
          setGranted(permission.granted);
        }
      })
      .catch(() => {
        if (alive) {
          setGranted(false);
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  const request = async () => {
    setRequesting(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      setGranted(permission.granted);
      // Người dùng đã từ chối vĩnh viễn → chỉ còn cách vào Cài đặt hệ thống.
      if (!permission.granted && !permission.canAskAgain) {
        void Linking.openSettings();
      }
    } catch {
      setGranted(false);
    } finally {
      setRequesting(false);
    }
  };

  return { granted, requesting, request };
}

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
