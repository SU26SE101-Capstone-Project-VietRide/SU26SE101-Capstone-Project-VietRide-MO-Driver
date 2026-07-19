import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

import { registerDeviceToken, removeDeviceToken } from "@/api/auth";
import type { DevicePlatform } from "@/api/types";

// Expo Go (storeClient) đã gỡ push của expo-notifications từ SDK 53 → chỉ cần
// IMPORT module là throw và sập app. Vì vậy KHÔNG import tĩnh ở top-level; chỉ
// nạp lazy trong dev/standalone build. Ở Expo Go mọi hàm dưới đây thành no-op.
const isExpoGo = Constants.executionEnvironment === "storeClient";

// Lưu token đã đăng ký để gỡ đúng token đó khi logout.
let currentFcmToken: string | null = null;
let handlerConfigured = false;

// Nạp expo-notifications theo yêu cầu (chỉ gọi khi KHÔNG ở Expo Go).
function loadNotifications(): typeof import("expo-notifications") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-notifications") as typeof import("expo-notifications");
}

function currentPlatform(): DevicePlatform {
  if (Platform.OS === "android") {
    return "ANDROID";
  }
  if (Platform.OS === "ios") {
    return "IOS";
  }
  return "WEB";
}

async function ensureSetup(
  Notifications: typeof import("expo-notifications"),
): Promise<void> {
  // Hiển thị notification cả khi app đang mở (foreground) — cấu hình 1 lần.
  if (!handlerConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    handlerConfigured = true;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Thông báo VietRide",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

// Xin quyền → lấy FCM device token → đăng ký với backend. Best-effort:
// Expo Go / web / emulator / thiếu Firebase đều bỏ qua, KHÔNG chặn đăng nhập.
export async function registerPushToken(): Promise<void> {
  try {
    if (isExpoGo || Platform.OS === "web" || !Device.isDevice) {
      return;
    }

    const Notifications = loadNotifications();
    await ensureSetup(Notifications);

    const permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) {
      return;
    }

    const token = await Notifications.getDevicePushTokenAsync();
    const fcmToken = typeof token.data === "string" ? token.data : null;
    if (!fcmToken) {
      return;
    }

    await registerDeviceToken(fcmToken, currentPlatform());
    currentFcmToken = fcmToken;
  } catch {
    // Firebase chưa cấu hình / lỗi mạng → im lặng, thử lại ở lần đăng nhập sau.
  }
}

// Dữ liệu trong object data của push (chỉ chứa string theo doc BE).
export type PushData = Record<string, unknown>;

// Đăng ký lắng nghe khi user CHẠM vào thông báo (foreground/background/terminated).
// Trả hàm cleanup. No-op ở Expo Go / web. Cũng xử lý cold-start (app mở từ push).
export function addNotificationResponseListener(
  handler: (data: PushData) => void,
): () => void {
  if (isExpoGo || Platform.OS === "web") {
    return () => {};
  }

  const Notifications = loadNotifications();

  // Cold-start: app được mở bằng cách chạm push lúc đang tắt.
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      const data = response?.notification.request.content.data;
      if (data) {
        handler(data as PushData);
      }
    })
    .catch(() => {
      /* bỏ qua */
    });

  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data;
      if (data) {
        handler(data as PushData);
      }
    },
  );

  return () => subscription.remove();
}

// Gỡ token khỏi backend khi logout. Gọi TRƯỚC khi xóa access token (cần auth).
export async function unregisterPushToken(): Promise<void> {
  if (!currentFcmToken) {
    return;
  }

  try {
    await removeDeviceToken(currentFcmToken);
  } catch {
    // Best-effort: mất mạng vẫn cho logout local.
  } finally {
    currentFcmToken = null;
  }
}
