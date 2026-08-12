import { MaterialIcons } from "@expo/vector-icons";
import { MapboxNavigationView } from "@badatgil/expo-mapbox-navigation";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { GeoPoint } from "@/api/types";
import { Spacing, type Palette } from "@/constants/theme";
import { useThemeMode } from "@/features/theme/theme-mode";
import { useSelectedTrip } from "@/features/trips/selected-trip-context";
import { useTripDetails } from "@/features/trips/use-trips";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

import { useTripRouteGeometry } from "./use-route";

// Toạ độ hợp lệ mới đưa vào danh sách dẫn đường.
function isValidPoint(point: GeoPoint): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}

// Màn dẫn đường turn-by-turn TRONG APP (Mức 3 — thử nghiệm Mapbox Navigation
// SDK, free tier 100 MAU + 1.000 chuyến/tháng). Điểm đầu là VỊ TRÍ HIỆN TẠI
// của xe, đi qua các điểm dừng CHƯA QUA rồi tới bến đích — bám đúng lộ trình
// nhà xe thay vì để engine tự chọn đường ngắn nhất bỏ qua điểm dừng.
export function TurnByTurnScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  // Theo theme trong app (Cài đặt), không theo theme hệ điều hành.
  const { mode } = useThemeMode();

  const activeTrip = useSelectedTrip();
  const tripId = activeTrip.trip?.tripId ?? null;
  const routeQuery = useTripRouteGeometry(tripId);
  const detailsQuery = useTripDetails(tripId);

  // Vị trí hiện tại làm điểm xuất phát của lộ trình dẫn đường. Navigation SDK
  // đọc GPS thiết bị thật — chế độ EXPO_PUBLIC_FAKE_GPS không áp vào màn này.
  const [origin, setOrigin] = useState<GeoPoint | null>(null);
  const [locationError, setLocationError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const locate = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (cancelled) {
        return;
      }
      if (!permission.granted) {
        setLocationError(true);
        return;
      }
      try {
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (!cancelled) {
          setOrigin({
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          });
        }
      } catch {
        if (!cancelled) {
          setLocationError(true);
        }
      }
    };

    void locate();

    return () => {
      cancelled = true;
    };
  }, []);

  // Lộ trình: vị trí hiện tại → các điểm dừng chưa qua (theo status BE, sắp
  // theo sequence) → bến đích. Stop đã ARRIVED/SKIPPED bị loại để không dẫn
  // vòng lại điểm cũ.
  const coordinates = useMemo(() => {
    const r = routeQuery.data;
    const dest = r?.destinationStation;
    if (!origin || !dest || !isValidPoint(dest)) {
      return null;
    }

    const passed = new Set(
      (detailsQuery.data?.stops ?? [])
        .filter((s) => s.status === "ARRIVED" || s.status === "SKIPPED")
        .map((s) => s.stopId),
    );

    const upcomingStops = (r.intermediateStops ?? [])
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .filter((s) => !passed.has(s.stopId) && isValidPoint(s));

    return [
      origin,
      ...upcomingStops.map((s) => ({
        latitude: s.latitude,
        longitude: s.longitude,
      })),
      { latitude: dest.latitude, longitude: dest.longitude },
    ];
  }, [origin, routeQuery.data, detailsQuery.data]);

  const loading =
    routeQuery.isLoading ||
    detailsQuery.isLoading ||
    (!origin && !locationError);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={styles.message}>Đang chuẩn bị dẫn đường…</Text>
        </View>
      ) : locationError ? (
        <View style={styles.center}>
          <Text style={styles.message}>
            Chưa lấy được vị trí hiện tại. Kiểm tra quyền vị trí của VietRide
            Driver rồi thử lại.
          </Text>
        </View>
      ) : !coordinates ? (
        <View style={styles.center}>
          <Text style={styles.message}>
            Chuyến chưa có toạ độ bến đích để dẫn đường.
          </Text>
        </View>
      ) : (
        <MapboxNavigationView
          style={styles.nav}
          coordinates={coordinates}
          locale="vi"
          // Dùng CÙNG style với màn Bản đồ tuyến (dark-v11 / streets-v12) để
          // hai màn bản đồ đồng bộ một chất nhìn. LƯU Ý: đổi style ở đây thì
          // phải khớp routeLineBelowLayerId trong patch native ("road-label"
          // cho style classic, "road-label-navigation" cho style navigation).
          mapStyle={
            mode === "dark"
              ? "mapbox://styles/mapbox/dark-v11"
              : "mapbox://styles/mapbox/streets-v12"
          }
          // Camera bám sát hơn mặc định để tài xế thấy rõ ngã rẽ sắp tới.
          followingZoom={16.5}
          onCancelNavigation={() => router.back()}
          onFinalDestinationArrival={() => router.back()}
        />
      )}

      {/* Không đặt nút thoát overlay — banner chỉ dẫn của SDK chiếm đỉnh màn,
          nút X sẽ bị đè; dùng nút cancel có sẵn ở thanh dưới của SDK. Chỉ khi
          màn ở trạng thái loading/lỗi (chưa có UI của SDK) mới hiện nút đóng. */}
      {loading || locationError || !coordinates ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng dẫn đường"
          onPress={() => router.back()}
          style={[
            styles.backButton,
            { top: Math.max(insets.top, Spacing.three) },
          ]}
        >
          <MaterialIcons name="close" size={22} color={theme.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    nav: {
      flex: 1,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: Spacing.two,
      padding: Spacing.four,
    },
    message: {
      color: c.textMeta,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
    },
    backButton: {
      position: "absolute",
      left: Spacing.three,
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.backgroundElement,
    },
  });
