import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { listNotifications, markNotificationRead } from "@/api/notifications";
import type { NotificationListData } from "@/api/types";

const PAGE_SIZE = 20;

export function useNotificationList(params: {
  page: number;
  unreadOnly?: boolean;
}) {
  return useQuery({
    queryKey: ["notifications", "list", params],
    queryFn: () =>
      listNotifications({
        page: params.page,
        pageSize: PAGE_SIZE,
        unreadOnly: params.unreadOnly,
        sortBy: "createdAt",
        sortDir: "desc",
      }),
  });
}

// Badge chuông: chỉ cần tổng số chưa đọc → xin 1 item, đọc totalItems.
export function useUnreadNotificationsCount(): number {
  const query = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => listNotifications({ page: 1, pageSize: 1, unreadOnly: true }),
    refetchInterval: 60_000,
  });

  return query.data?.totalItems ?? 0;
}

// Đánh dấu đã đọc ngay trong cache trước khi server trả lời. BE chỉ trả 204 nên
// readAt do client tự đặt; lần refetch sau sẽ ghi đè bằng giá trị thật.
function applyReadToCache(queryClient: QueryClient, ids: Set<string>) {
  // Gom id thực sự chuyển từ chưa đọc → đã đọc. Một thông báo có thể nằm trong
  // nhiều query list (khác page/filter) nên phải dùng Set để khỏi đếm trùng.
  const newlyRead = new Set<string>();

  queryClient.setQueriesData<NotificationListData>(
    { queryKey: ["notifications", "list"] },
    (data) => {
      if (!data) {
        return data;
      }

      const readAt = new Date().toISOString();
      let changed = false;
      const items = data.items.map((item) => {
        if (!ids.has(item.id) || item.readAt != null) {
          return item;
        }
        changed = true;
        newlyRead.add(item.id);
        return { ...item, readAt };
      });

      return changed ? { ...data, items } : data;
    },
  );

  if (newlyRead.size > 0) {
    queryClient.setQueryData<NotificationListData>(
      ["notifications", "unread-count"],
      (data) =>
        data
          ? {
              ...data,
              totalItems: Math.max(0, data.totalItems - newlyRead.size),
            }
          : data,
    );
  }
}

// Huỷ refetch đang bay + snapshot cache để rollback khi PATCH lỗi.
async function beginOptimisticRead(queryClient: QueryClient, ids: Set<string>) {
  await queryClient.cancelQueries({ queryKey: ["notifications"] });
  const snapshot = queryClient.getQueriesData({ queryKey: ["notifications"] });
  applyReadToCache(queryClient, ids);
  return snapshot;
}

function rollback(
  queryClient: QueryClient,
  snapshot: ReturnType<QueryClient["getQueriesData"]> | undefined,
) {
  snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
}

export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      markNotificationRead(notificationId),
    onMutate: (notificationId) =>
      beginOptimisticRead(queryClient, new Set([notificationId])),
    onError: (_error, _id, snapshot) => rollback(queryClient, snapshot),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

// "Đọc tất cả": BE không có endpoint hàng loạt → bắn song song từng id, nhưng
// chỉ cập nhật cache MỘT lần và invalidate MỘT lần ở cuối (trước đây mỗi item
// tự invalidate nên n thông báo = n lượt refetch, UI đứng hình).
export function useMarkAllNotificationsReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationIds: string[]) => {
      await Promise.allSettled(notificationIds.map(markNotificationRead));
    },
    onMutate: (notificationIds) =>
      beginOptimisticRead(queryClient, new Set(notificationIds)),
    onError: (_error, _ids, snapshot) => rollback(queryClient, snapshot),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
