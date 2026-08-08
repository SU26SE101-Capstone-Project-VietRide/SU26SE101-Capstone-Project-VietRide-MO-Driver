import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ErrorCard } from "@/components/query-state";
import { Fonts, Spacing, type Palette } from "@/constants/theme";
import {
  SectionTitle,
  StatusChip,
  SurfaceCard,
} from "@/features/operations/ui";
import { formatTimeHM } from "@/features/trips/trip-format";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

import {
  shuttleDirectionLabelOf,
  shuttleTripStatusOf,
} from "./shuttle-format";
import { useDriverShuttleTrips } from "./use-shuttle";

// Danh sách chuyến trung chuyển được gán cho driver (window backend default:
// hôm nay → +14 ngày). Không có chuyến nào thì ẩn luôn section — phần lớn
// driver không chạy shuttle, không chiếm chỗ màn Lịch.
export function ShuttleScheduleSection() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const query = useDriverShuttleTrips();

  if (query.isError) {
    // Chỉ hiện lỗi khi đã từng có data (refetch lỗi). Lỗi lần đầu (chưa có
    // data) thường do endpoint driver shuttle chưa được BE deploy → ẩn im
    // lặng, tránh làm bẩn màn Lịch cho các driver không chạy shuttle.
    if (!query.data) {
      return null;
    }

    return (
      <View style={styles.section}>
        <SectionTitle
          icon="airport-shuttle"
          title="Xe trung chuyển"
          subtitle="Không tải được danh sách."
        />
        <ErrorCard onRetry={() => void query.refetch()} />
      </View>
    );
  }

  const items = query.data?.items ?? [];
  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.section}>
      <SectionTitle
        icon="airport-shuttle"
        title="Xe trung chuyển"
        subtitle={`${items.length} chuyến được phân công`}
      />
      {items.map((item, index) => {
        const statusMeta = shuttleTripStatusOf(item.status);

        return (
          <SurfaceCard key={item.shuttleTripId} delay={index * 40}>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push(`/driver/shuttle/${item.shuttleTripId}`)
              }
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.plate}>{item.licensePlate}</Text>
                <StatusChip label={statusMeta.label} tone={statusMeta.tone} />
              </View>
              <Text style={styles.direction}>
                {shuttleDirectionLabelOf(item.direction)}
              </Text>
              <View style={styles.metaRow}>
                <MaterialIcons
                  name="schedule"
                  size={16}
                  color={theme.textSecondary}
                />
                <Text style={styles.metaText}>
                  {formatTimeHM(item.scheduledDepartureTime)} →{" "}
                  {formatTimeHM(item.scheduledEndTime)}
                </Text>
                <MaterialIcons
                  name="group"
                  size={16}
                  color={theme.textSecondary}
                />
                <Text style={styles.metaText}>
                  {item.passengerCount} khách · {item.stopCount} điểm đón
                </Text>
              </View>
            </Pressable>
          </SurfaceCard>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    section: {
      gap: Spacing.two,
    },
    pressed: {
      opacity: 0.7,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: Spacing.two,
    },
    plate: {
      fontFamily: Fonts.rounded,
      fontSize: 16,
      fontWeight: 700,
      color: c.text,
    },
    direction: {
      marginTop: 4,
      fontSize: 13,
      color: c.textSecondary,
    },
    metaRow: {
      marginTop: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    metaText: {
      fontSize: 12,
      color: c.textSecondary,
      marginRight: Spacing.two,
    },
  });
