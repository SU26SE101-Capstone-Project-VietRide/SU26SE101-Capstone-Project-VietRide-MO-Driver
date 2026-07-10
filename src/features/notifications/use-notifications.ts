import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listNotifications, markNotificationRead } from "@/api/notifications";

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

export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      markNotificationRead(notificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
