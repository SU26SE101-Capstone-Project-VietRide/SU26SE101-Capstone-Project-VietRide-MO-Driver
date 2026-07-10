import { apiRequest } from "./client";
import type { NotificationListData } from "./types";

export type NotificationListParams = {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
  sortBy?: "createdAt" | "readAt" | "type";
  sortDir?: "asc" | "desc";
};

export function listNotifications(
  params: NotificationListParams = {},
): Promise<NotificationListData> {
  const query = new URLSearchParams();

  if (params.page != null) query.set("page", String(params.page));
  if (params.pageSize != null) query.set("pageSize", String(params.pageSize));
  if (params.unreadOnly != null)
    query.set("unreadOnly", String(params.unreadOnly));
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.sortDir) query.set("sortDir", params.sortDir);

  // Không dùng query.size — polyfill URLSearchParams của RN chưa chắc có.
  const queryString = query.toString();
  const suffix = queryString ? `?${queryString}` : "";
  return apiRequest<NotificationListData>(`/api/v1/notifications${suffix}`);
}

export async function markNotificationRead(
  notificationId: string,
): Promise<void> {
  await apiRequest<unknown>(`/api/v1/notifications/${notificationId}`, {
    method: "PATCH",
    body: { read: true },
  });
}
