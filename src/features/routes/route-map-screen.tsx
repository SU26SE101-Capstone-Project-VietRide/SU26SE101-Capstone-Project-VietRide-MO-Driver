import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts, Spacing, type Palette } from "@/constants/theme";
import { buildSimulationPath } from "@/features/tracking/fake-gps-route";
import { useRouteDeviation } from "@/features/tracking/use-route-deviation";
import { useSelectedTrip } from "@/features/trips/selected-trip-context";
import { useTripDetails } from "@/features/trips/use-trips";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

import { TripRouteMap } from "./trip-route-map";
import { useLiveVehiclePosition } from "./use-live-vehicle-position";
import { useTripRouteGeometry } from "./use-route";

// Màn theo dõi hành trình toàn màn hình: bản đồ Mapbox đầy đủ cử chỉ, vị trí xe
// realtime bám theo tuyến của nhà xe, cảnh báo lệch lộ trình từ BE.
export function RouteMapScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const activeTrip = useSelectedTrip();
  const tripId = activeTrip.trip?.tripId ?? null;
  const routeQuery = useTripRouteGeometry(tripId);
  const detailsQuery = useTripDetails(tripId);

  // Chỉ theo dõi xe khi chuyến đang chạy — chuyến chưa chạy thì map tĩnh như cũ.
  const tripInProgress = detailsQuery.data?.status === "IN_PROGRESS";
  // Chỉ dùng khi bật cờ demo EXPO_PUBLIC_FAKE_GPS; bình thường là mảng rỗng.
  const simulationPath = useMemo(
    () => buildSimulationPath(routeQuery.data),
    [routeQuery.data],
  );
  const vehicle = useLiveVehiclePosition(tripInProgress, simulationPath);
  // Mặc định bám xe khi có vị trí; tài xế bấm nút để xem toàn tuyến.
  const [follow, setFollow] = useState(true);

  // Stop đã qua: status ARRIVED/SKIPPED từ trip details (BE là nguồn duy nhất).
  const passedStopIds = useMemo(
    () =>
      (detailsQuery.data?.stops ?? [])
        .filter((s) => s.status === "ARRIVED" || s.status === "SKIPPED")
        .map((s) => s.stopId),
    [detailsQuery.data],
  );

  // Cảnh báo lệch tuyến từ BE (socket listen-only — màn này không phát GPS).
  const deviation = useRouteDeviation(tripId);

  // Điểm dừng kế tiếp: stop PENDING đầu tiên theo orderIndex — cho thanh
  // trạng thái. Hết stop thì hiển thị bến đích.
  const nextStopName = useMemo(() => {
    const stops = detailsQuery.data?.stops ?? [];
    const pending = stops
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .find((s) => s.status === "PENDING");
    return (
      pending?.name ?? routeQuery.data?.destinationStation?.name ?? null
    );
  }, [detailsQuery.data, routeQuery.data]);

  const originName = routeQuery.data?.originStation?.name ?? null;
  const destinationName = routeQuery.data?.destinationStation?.name ?? null;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/driver/trip");
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {routeQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : routeQuery.isError || !routeQuery.data ? (
        <View style={styles.center}>
          <Text style={styles.message}>
            Không tải được bản đồ tuyến. Quay lại và thử lại.
          </Text>
        </View>
      ) : (
        <TripRouteMap
          route={routeQuery.data}
          interactive
          fill
          vehicle={vehicle}
          followVehicle={follow && vehicle != null}
          passedStopIds={passedStopIds}
        />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Đóng bản đồ"
        onPress={handleBack}
        style={[styles.backButton, { top: Math.max(insets.top, Spacing.three) }]}
      >
        <MaterialIcons name="arrow-back" size={22} color={theme.text} />
      </Pressable>

      {vehicle ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={follow ? "Xem toàn tuyến" : "Bám theo xe"}
          onPress={() => setFollow((f) => !f)}
          style={[
            styles.followButton,
            { top: Math.max(insets.top, Spacing.three) },
          ]}
        >
          <MaterialIcons
            name={follow ? "zoom-out-map" : "navigation"}
            size={22}
            color={theme.text}
          />
        </Pressable>
      ) : null}

      {originName && destinationName ? (
        <View
          pointerEvents="none"
          style={[
            styles.routePill,
            { top: Math.max(insets.top, Spacing.three) },
          ]}
        >
          {/* 3 dòng chủ động: bến đi / mũi tên / bến đến — không để Text tự
              bẻ dòng giữa tên bến thành từ mồ côi. */}
          <Text style={styles.routePillText} numberOfLines={1}>
            {originName}
          </Text>
          <Text style={styles.routePillArrow}>↓</Text>
          <Text style={styles.routePillText} numberOfLines={1}>
            {destinationName}
          </Text>
        </View>
      ) : null}

      {vehicle ? (
        <View
          style={[
            styles.statusBar,
            { bottom: Math.max(insets.bottom, Spacing.three) },
          ]}
        >
          <View style={styles.liveDot} />
          <Text style={styles.statusSpeed}>
            {vehicle.speedKmh != null
              ? `${Math.round(vehicle.speedKmh)} km/h`
              : "— km/h"}
          </Text>
          {nextStopName ? (
            <>
              <View style={styles.statusDivider} />
              <Text style={styles.statusNext} numberOfLines={1}>
                Điểm dừng kế: {nextStopName}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}

      {/* Chuyến chưa chạy (kể cả xe thay thế vừa được gán sau sự cố) thì KHÔNG
          bám vị trí và cũng không vẽ điểm xe giả lên tuyến — nói thẳng là đang
          chờ, để crew không tưởng bản đồ hỏng
          (MOBILE-VEHICLE-SUBSTITUTION-PARCEL-TRANSFER.md §Tracking). */}
      {!tripInProgress && routeQuery.data ? (
        <View
          style={[
            styles.statusBar,
            { bottom: Math.max(insets.bottom, Spacing.three) },
          ]}
        >
          <MaterialIcons
            name="schedule"
            size={16}
            color={theme.textSecondary}
          />
          <Text style={styles.statusNext} numberOfLines={2}>
            Chuyến chưa bắt đầu — chưa theo dõi được vị trí xe.
          </Text>
        </View>
      ) : null}

      {/* Chuyến terminal thì đóng banner ngay — BE cố ý không phát
          ROUTE_RESTORED khi trip kết thúc (FE-RESPONSE-route-deviation §6). */}
      {deviation && tripInProgress ? (
        <View
          style={[
            styles.deviationBanner,
            { top: Math.max(insets.top, Spacing.three) + 52 },
          ]}
        >
          <MaterialIcons name="warning" size={18} color="#FFFFFF" />
          <Text style={styles.deviationText}>
            {deviation.distanceMeters != null
              ? `Xe đang lệch lộ trình khoảng ${Math.round(deviation.distanceMeters)} m`
              : "Xe đang lệch lộ trình"}
          </Text>
        </View>
      ) : null}

      {routeQuery.data && !routeQuery.data.geometry ? (
        <View
          style={[
            styles.noteBanner,
            // Có thanh trạng thái thì đẩy note lên trên để không chồng nhau.
            {
              bottom:
                Math.max(insets.bottom, Spacing.three) + (vehicle ? 64 : 0),
            },
          ]}
        >
          <Text style={styles.noteText}>
            Tuyến chưa có đường đi thực tế — chỉ hiển thị các điểm dừng.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
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
    followButton: {
      position: "absolute",
      right: Spacing.three,
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.backgroundElement,
    },
    routePill: {
      position: "absolute",
      alignSelf: "center",
      // Chừa 2 bên cho nút back (trái) và nút bám xe (phải): 44px + lề.
      maxWidth: "60%",
      // Cao tối thiểu bằng nút back (44) để 1 dòng hay 2 dòng đều thẳng hàng.
      minHeight: 44,
      justifyContent: "center",
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.backgroundElement,
      paddingVertical: Spacing.two,
      paddingHorizontal: Spacing.three,
    },
    routePillText: {
      color: c.text,
      fontFamily: Fonts.sans,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "600",
      textAlign: "center",
    },
    routePillArrow: {
      color: c.primary,
      fontWeight: "700",
      fontSize: 13,
      lineHeight: 15,
      textAlign: "center",
    },
    statusBar: {
      position: "absolute",
      left: Spacing.three,
      right: Spacing.three,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.backgroundElement,
      paddingVertical: Spacing.two + 2,
      paddingHorizontal: Spacing.three,
    },
    liveDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.primary,
    },
    statusSpeed: {
      color: c.text,
      fontFamily: Fonts.sans,
      fontSize: 15,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    statusDivider: {
      width: 1,
      height: 16,
      backgroundColor: c.border,
    },
    statusNext: {
      flex: 1,
      color: c.textMeta,
      fontFamily: Fonts.sans,
      fontSize: 13,
    },
    deviationBanner: {
      position: "absolute",
      left: Spacing.three,
      right: Spacing.three,
      flexDirection: "row",
      alignItems: "center",
      gap: Spacing.two,
      borderRadius: 14,
      backgroundColor: c.dangerSolid,
      paddingVertical: Spacing.two,
      paddingHorizontal: Spacing.three,
    },
    deviationText: {
      flex: 1,
      color: "#FFFFFF",
      fontFamily: Fonts.sans,
      fontSize: 14,
      lineHeight: 19,
    },
    noteBanner: {
      position: "absolute",
      left: Spacing.three,
      right: Spacing.three,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.backgroundElement,
      padding: Spacing.three,
    },
    noteText: {
      color: c.text,
      fontFamily: Fonts.sans,
      fontSize: 13,
      lineHeight: 18,
    },
  });
