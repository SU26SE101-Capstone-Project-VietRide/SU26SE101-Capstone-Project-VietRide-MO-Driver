import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect } from "react";

import type { NotificationAction } from "@/api/types";
import { useSession } from "@/features/session/session-context";

import {
  actionFromPushData,
  invalidationKeysForAction,
  resolveActionHref,
} from "./notification-action";
import {
  addNotificationForegroundListener,
  addNotificationResponseListener,
  type PushData,
} from "./push";

// Push không phải source of truth — chỉ là tín hiệu làm mới inbox + data của
// màn liên quan (FE-REQUEST-realtime-booking-notify-RESPONSE.md). Dùng chung
// cho cả hai listener: nhận foreground (không điều hướng) và tap.
function invalidateForPush(
  queryClient: QueryClient,
  data: PushData,
): NotificationAction {
  void queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const action = actionFromPushData(data);

  for (const queryKey of invalidationKeysForAction(action)) {
    void queryClient.invalidateQueries({ queryKey });
  }

  // BOOKING_TRANSFERRED phát cho cả trip cũ và mới; hai id này nằm ở data
  // legacy chứ không có trong action.params.
  const params = action.params as Record<string, unknown>;
  const tripId = typeof params.tripId === "string" ? params.tripId : null;
  for (const key of ["oldTripId", "newTripId"] as const) {
    const otherId = typeof data[key] === "string" ? data[key] : null;
    if (otherId && otherId !== tripId) {
      void queryClient.invalidateQueries({ queryKey: ["manifest", otherId] });
      void queryClient.invalidateQueries({ queryKey: ["seat-map", otherId] });
      void queryClient.invalidateQueries({ queryKey: ["trip", otherId] });
    }
  }

  return action;
}

// Khi user chạm vào push: làm mới inbox rồi điều hướng theo action.
// Từ Phase 11 BE gửi kèm actionType + actionParams (JSON string) trong FCM data;
// payload cũ chỉ có data.type + id legacy nên vẫn được suy ra action ở
// actionFromPushData. Chỉ chạy khi đã đăng nhập.
export function usePushNavigation() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { role } = useSession();

  useEffect(() => {
    if (!role) {
      return;
    }

    const cleanupTap = addNotificationResponseListener((data) => {
      const action = invalidateForPush(queryClient, data);

      // Action không có màn đích trong app crew (ví, subscription, NONE...) →
      // mở inbox để user vẫn đọc được nội dung.
      const href = resolveActionHref(action, role);
      router.push(href ?? "/notifications");
    });

    // Push tới lúc app đang mở: invalidate ngay để màn đang xem (vd Đón khách)
    // tự refetch, KHÔNG điều hướng — user đang làm việc, chỉ báo bằng banner
    // hệ thống (setNotificationHandler đã bật hiển thị foreground).
    const cleanupForeground = addNotificationForegroundListener((data) => {
      invalidateForPush(queryClient, data);
    });

    return () => {
      cleanupTap();
      cleanupForeground();
    };
  }, [role, router, queryClient]);
}
