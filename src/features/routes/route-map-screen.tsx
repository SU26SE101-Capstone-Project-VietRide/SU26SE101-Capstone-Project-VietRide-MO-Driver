import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts, Spacing, type Palette } from "@/constants/theme";
import { useActiveTrip } from "@/features/trips/use-trips";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

import { TripRouteMap } from "./trip-route-map";
import { useTripRoute } from "./use-route";

// Bản đồ toàn màn hình: bật đầy đủ cử chỉ kéo/zoom/xoay (không bị ScrollView giành).
export function RouteMapScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const activeTrip = useActiveTrip();
  const tripId = activeTrip.trip?.tripId ?? null;
  const routeQuery = useTripRoute(tripId);

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
        <TripRouteMap route={routeQuery.data} interactive fill />
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Đóng bản đồ"
        onPress={handleBack}
        style={[styles.backButton, { top: Math.max(insets.top, Spacing.three) }]}
      >
        <MaterialIcons name="arrow-back" size={22} color={theme.text} />
      </Pressable>

      {routeQuery.data && !routeQuery.data.pathPolyline ? (
        <View
          style={[
            styles.noteBanner,
            { bottom: Math.max(insets.bottom, Spacing.three) },
          ]}
        >
          <Text style={styles.noteText}>
            Tuyến chưa có đường đi thực tế — đang nối tạm qua các điểm dừng.
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
