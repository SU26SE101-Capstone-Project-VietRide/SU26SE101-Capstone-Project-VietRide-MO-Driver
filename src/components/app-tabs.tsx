import { MaterialIcons } from "@expo/vector-icons";
import { type Href } from "expo-router";
import {
    TabList,
    Tabs,
    TabSlot,
    TabTrigger,
    type TabTriggerSlotProps,
} from "expo-router/ui";
import { type ComponentProps } from "react";
import {
    Pressable,
    StyleSheet,
    Text,
    View,
    type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts, type Palette } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

type TabVariant = "driver" | "assistant";
type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"];

type TabItem = {
  name: string;
  href: Href;
  label: string;
  icon: MaterialIconName;
};

// Tab bar dùng @expo/vector-icons (MaterialIcons) — font đi kèm sẵn nên không
// cần tải runtime, an toàn trên thiết bị thật.
const TAB_CONFIG: Record<TabVariant, TabItem[]> = {
  driver: [
    { name: "index", href: "/driver", label: "Lịch làm việc", icon: "event-note" },
    { name: "trip", href: "/driver/trip", label: "Chuyến", icon: "map" },
    { name: "incident", href: "/driver/incident", label: "Sự cố", icon: "warning" },
    {
      name: "support",
      href: "/driver/support",
      label: "Hỗ trợ",
      icon: "support-agent",
    },
    {
      name: "settings",
      href: "/driver/settings",
      label: "Cài đặt",
      icon: "settings",
    },
  ],
  assistant: [
    {
      name: "index",
      href: "/assistant",
      label: "Lịch làm việc",
      icon: "event-note",
    },
    { name: "boarding", href: "/assistant/boarding", label: "Đón khách", icon: "group" },
    { name: "cargo", href: "/assistant/cargo", label: "Hàng hóa", icon: "inventory-2" },
    {
      name: "stops",
      href: "/assistant/stops",
      label: "Điểm dừng",
      icon: "location-on",
    },
    {
      name: "support",
      href: "/assistant/support",
      label: "Hỗ trợ",
      icon: "support-agent",
    },
    {
      name: "settings",
      href: "/assistant/settings",
      label: "Cài đặt",
      icon: "settings",
    },
  ],
};

type AppTabsProps = {
  variant: TabVariant;
};

export default function AppTabs({ variant }: AppTabsProps) {
  const styles = useThemedStyles(makeStyles);
  const tabs = TAB_CONFIG[variant];

  return (
    <Tabs style={styles.root}>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <TabBar>
          {tabs.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TabButton icon={tab.icon} label={tab.label} />
            </TabTrigger>
          ))}
        </TabBar>
      </TabList>
    </Tabs>
  );
}

// Thanh tab bo tròn góc trên, đổ bóng nhẹ — giống bottom bar của App User.
function TabBar({ style, children, ...rest }: ViewProps) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <View
      {...rest}
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }, style]}
    >
      {children}
    </View>
  );
}

// Tab item: icon trên, nhãn dưới. Tab đang chọn có "pill" bo tròn nền teal bao
// quanh icon + nhãn (giống ô active trong Figma App User).
function TabButton({
  icon,
  label,
  isFocused,
  ...props
}: TabTriggerSlotProps & { icon: MaterialIconName; label: string }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const color = isFocused ? theme.tones.primary.text : theme.textSecondary;

  return (
    <Pressable
      {...props}
      style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}
    >
      <View style={[styles.pill, isFocused && styles.pillActive]}>
        <MaterialIcons name={icon} size={22} color={color} />
        <Text numberOfLines={1} style={[styles.label, { color }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: c.background,
    },
    slot: {
      flex: 1,
    },
    bar: {
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: c.backgroundElement,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderColor: c.border,
      paddingTop: 10,
      paddingHorizontal: 6,
      // Đổ bóng hướng lên trên giống Figma (drop-shadow 0 -8 10 rgba(33,37,41,.05)).
      shadowColor: "#212529",
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 16,
    },
    tabButton: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 2,
    },
    pressed: {
      opacity: 0.7,
    },
    pill: {
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 22,
      // Ép clip để Android không "mất" bo góc khi re-render lúc chuyển tab
      // (bug khi View bo góc + background nằm trong parent có elevation).
      overflow: "hidden",
    },
    pillActive: {
      backgroundColor: c.tones.primary.background,
    },
    label: {
      fontFamily: Fonts.rounded,
      fontSize: 10,
      fontWeight: 700,
      textAlign: "center",
    },
  });
