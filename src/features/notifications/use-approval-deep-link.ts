import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { useSession } from "@/features/session/session-context";

import { approvalHrefFromUrl } from "./notification-action";

// Mở phiếu duyệt từ link — FE-PCL-003.
//
// Bản E2E production 2026-08-31: link phiếu duyệt mở Chrome thay vì mở
// VietRide. Sửa gồm hai phần, đây là phần trong app:
//   - `app.json` đã đăng ký App Link cho các tiền tố đường dẫn của phiếu duyệt
//     (trước đó chỉ có `/auth/set-password`), nên link https vào được app;
//   - Expo Router tự khớp URL với cây route, nhưng link BE gửi có hình dạng
//     đường dẫn của API (`/parcel-stop-departure-approvals/{id}`) chứ không
//     trùng route app → phải tự map, nếu không app mở lên rồi đứng ở màn mặc
//     định và người dùng tưởng link hỏng.
//
// `useLinkingURL()` trả URL khởi động (app đang tắt) lẫn URL tới khi app đang
// mở, nên cùng một đường xử lý cho foreground/background/terminated. KHÔNG
// dùng `Linking.useURL()`: SDK 56 đã đánh dấu deprecated cho hook đó.
export function useApprovalDeepLink() {
  const url = Linking.useLinkingURL();
  const router = useRouter();
  const { role } = useSession();

  // Cùng một URL có thể được phát lại (rerender, đổi role) — chỉ điều hướng
  // một lần cho mỗi URL, không thì màn phiếu bị push chồng nhiều lớp.
  const handledUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!url || url === handledUrlRef.current) {
      return;
    }

    // Chỉ tài xế mới duyệt phiếu được. Chưa đăng nhập thì bỏ qua URL này —
    // giữ lại để mở sau sẽ dẫn tới điều hướng bất ngờ sau màn đăng nhập.
    if (role !== "DRIVER") {
      return;
    }

    const href = approvalHrefFromUrl(url);
    if (!href) {
      // Không phải link phiếu duyệt → để Expo Router xử lý như bình thường.
      return;
    }

    handledUrlRef.current = url;
    router.push(href);
  }, [url, role, router]);
}
