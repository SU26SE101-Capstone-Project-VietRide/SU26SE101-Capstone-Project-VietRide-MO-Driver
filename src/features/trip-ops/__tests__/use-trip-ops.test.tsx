import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import {
  useArriveAtDestination,
  useArriveAtStop,
  useCompleteTrip,
  useDepartFromStop,
  useStartTrip,
} from "@/features/trip-ops/use-trip-ops";
import { createTestQueryClient } from "@/test-utils/query-client";

jest.mock("@/api/driver-ops", () => ({
  startTrip: jest.fn(async () => ({})),
  arriveAtStop: jest.fn(async () => ({})),
  departFromStop: jest.fn(async () => ({})),
  arriveAtDestination: jest.fn(async () => ({})),
  completeTrip: jest.fn(async () => ({})),
  reportIncident: jest.fn(async () => ({})),
}));

const TRIP_ID = "b31a345e-255a-4d0f-8f48-0fb3af9c3d17";
const STOP_ID = "082c5a49-75c8-423f-b7ff-85d925d887e8";

// FE-PCL-005: sau mỗi bước vòng đời chuyến, MỌI query phụ thuộc trạng thái
// chuyến phải bị đánh dấu stale — không được để tab này mới, tab kia cũ.
// Trước khi sửa, arrive/depart bỏ quên `schedule` (nơi bộ chọn chuyến và
// useActiveTrip đọc status) còn start/complete bỏ quên manifest kiện hàng.
const DEPENDENT_KEYS: unknown[][] = [
  ["schedule", "2026-08-30", "2026-08-31"],
  ["trip", TRIP_ID],
  ["assistant-parcels", TRIP_ID],
  ["seat-map", TRIP_ID],
  ["tracking-etas", TRIP_ID],
];

// Mỗi bước vòng đời + cách kích hoạt mutation của nó.
const LIFECYCLE_STEPS = [
  { name: "bắt đầu chuyến", hook: useStartTrip, variables: undefined },
  { name: "tới điểm dừng", hook: useArriveAtStop, variables: STOP_ID },
  { name: "rời điểm dừng", hook: useDepartFromStop, variables: STOP_ID },
  { name: "tới bến cuối", hook: useArriveAtDestination, variables: undefined },
  { name: "hoàn tất chuyến", hook: useCompleteTrip, variables: undefined },
] as const;

describe("làm mới cache sau mỗi bước vòng đời chuyến", () => {
  it.each(LIFECYCLE_STEPS)(
    "$name làm stale mọi query phụ thuộc trạng thái chuyến",
    async ({ hook, variables }) => {
      const queryClient = createTestQueryClient();
      const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );

      // Nạp sẵn dữ liệu "cũ" và ép về fresh để phép thử có ý nghĩa.
      for (const queryKey of DEPENDENT_KEYS) {
        queryClient.setQueryData(queryKey, { stale: false });
      }
      for (const query of queryClient.getQueryCache().getAll()) {
        expect(query.isStale()).toBe(false);
      }

      const { result } = await renderHook(
        () => (hook as (id: string | null) => ReturnType<typeof useStartTrip>)(TRIP_ID),
        { wrapper },
      );

      await act(async () => {
        (result.current.mutate as (vars?: unknown) => void)(variables);
      });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      for (const queryKey of DEPENDENT_KEYS) {
        const query = queryClient.getQueryCache().find({ queryKey });
        expect([queryKey, query?.isStale()]).toEqual([queryKey, true]);
      }

      queryClient.clear();
      queryClient.unmount();
    },
  );
});
