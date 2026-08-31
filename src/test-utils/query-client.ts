import { QueryClient } from "@tanstack/react-query";

// QueryClient dùng trong test.
//
// Hai khác biệt so với client thật, đều cần thiết cho test chạy được:
//   - `retry: false`: mặc định React Query thử lại 3 lần kèm backoff, nên một
//     mutation lỗi có chủ đích sẽ treo test hàng giây thay vì fail ngay;
//   - `gcTime: Infinity` cho CẢ query LẪN mutation: với gcTime hữu hạn (mặc
//     định 5 phút) mỗi entry cache hẹn một timer dọn rác, timer đó giữ event
//     loop sống và jest treo với "did not exit one second after the test run
//     has completed" (`--detectOpenHandles` KHÔNG chỉ ra được nó). React Query
//     bỏ qua hẳn việc hẹn giờ khi gcTime là Infinity.
//     Đừng quên vế mutation: timer của mutation cache mới là cái làm treo test
//     mutation, và nó không lộ ra ở test chỉ đọc query.
//     Cũng không dùng `gcTime: 0` được: query seed bằng `setQueryData` chưa có
//     observer nào sẽ bị dọn ngay lập tức và test không tìm thấy nó nữa.
//
// Luôn gọi `client.clear()` trong afterEach (hoặc dùng `withTestQueryClient`)
// để cache không rò từ test này sang test khác.
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}

// Chạy `run` với một client sạch rồi dọn, kể cả khi assert bên trong ném lỗi.
export async function withTestQueryClient<T>(
  run: (queryClient: QueryClient) => Promise<T>,
): Promise<T> {
  const queryClient = createTestQueryClient();
  try {
    return await run(queryClient);
  } finally {
    queryClient.clear();
    queryClient.unmount();
  }
}
