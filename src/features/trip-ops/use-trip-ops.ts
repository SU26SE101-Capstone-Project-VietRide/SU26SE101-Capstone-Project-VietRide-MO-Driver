import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { Linking } from "react-native";

import {
  arriveAtDestination,
  arriveAtStop,
  departFromStop,
  completeTrip,
  reportIncident,
  startTrip,
} from "@/api/driver-ops";
import type { ReportIncidentInput } from "@/api/types";
import { invalidateTripLifecycle } from "@/features/trip-ops/trip-cache";

// FE-PCL-005: mọi bước vòng đời chuyến làm mới CÙNG một danh sách query
// (xem `tripLifecycleQueryKeys`). Trước đây mỗi mutation tự chọn một hai key
// nên trạng thái đứng lại ở màn/tab khác cho tới khi crew kéo xuống refresh.
function useInvalidateTripLifecycle(tripId: string | null) {
  const queryClient = useQueryClient();

  return () => invalidateTripLifecycle(queryClient, tripId);
}

// Bắt đầu chuyến (BOARDING -> IN_PROGRESS).
export function useStartTrip(tripId: string | null) {
  const invalidate = useInvalidateTripLifecycle(tripId);

  return useMutation({
    mutationFn: () => startTrip(tripId as string),
    onSuccess: invalidate,
  });
}

// Xác nhận xe đã đến một điểm dừng.
export function useArriveAtStop(tripId: string | null) {
  const invalidate = useInvalidateTripLifecycle(tripId);

  return useMutation({
    mutationFn: (stopId: string) => arriveAtStop(tripId as string, stopId),
    onSuccess: invalidate,
  });
}

// Rời điểm dừng (Guide (2) §B6). Bị chặn khi điểm đó còn kiện chưa đối soát:
// backend trả 409 PARCEL_STOP_RECONCILIATION_REQUIRED kèm `approvalRequestId`
// để tài xế mở đúng phiếu đang chờ duyệt.
export function useDepartFromStop(tripId: string | null) {
  const invalidate = useInvalidateTripLifecycle(tripId);

  return useMutation({
    mutationFn: (stopId: string) => departFromStop(tripId as string, stopId),
    onSuccess: invalidate,
  });
}

// Xác nhận xe đã tới bến cuối. KHÔNG hoàn tất chuyến.
export function useArriveAtDestination(tripId: string | null) {
  const invalidate = useInvalidateTripLifecycle(tripId);

  return useMutation({
    mutationFn: () => arriveAtDestination(tripId as string),
    onSuccess: invalidate,
  });
}

// Hoàn tất chuyến.
export function useCompleteTrip(tripId: string | null) {
  const invalidate = useInvalidateTripLifecycle(tripId);

  return useMutation({
    mutationFn: () => completeTrip(tripId as string),
    onSuccess: invalidate,
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
