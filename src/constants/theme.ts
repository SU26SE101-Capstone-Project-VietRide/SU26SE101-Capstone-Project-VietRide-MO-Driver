/**
 * Bảng màu của app, định nghĩa cho cả chế độ Sáng (light) và Tối (dark).
 * Các màn dùng token ngữ nghĩa (text, surface, border…) thay vì mã màu cứng,
 * nhờ vậy chuyển light/dark là đổi toàn bộ giao diện.
 */

import "@/global.css";

import { Platform } from "react-native";

// Màu thương hiệu / theo trạng thái — giữ chung cho cả 2 chế độ.
const Brand = {
  primary: "#02C39A",
  primaryMuted: "#113F3A",
  success: "#00E676",
  warning: "#FFD600",
  danger: "#FF5252",
  info: "#35C2FF",
  onAccent: "#081211",
} as const;

// Tông màu nền/chữ cho các "tile", "chip" theo trạng thái — đổi theo chế độ
// để đảm bảo độ tương phản (đặc biệt chữ trên nền sáng).
const DarkTones = {
  primary: {
    background: "rgba(2, 195, 154, 0.14)",
    border: "rgba(2, 195, 154, 0.24)",
    text: "#02C39A",
  },
  neutral: {
    background: "rgba(148, 163, 174, 0.12)",
    border: "rgba(148, 163, 174, 0.18)",
    text: "#D3DBDF",
  },
  success: {
    background: "rgba(0, 230, 118, 0.14)",
    border: "rgba(0, 230, 118, 0.24)",
    text: "#00E676",
  },
  warning: {
    background: "rgba(255, 214, 0, 0.14)",
    border: "rgba(255, 214, 0, 0.24)",
    text: "#FFD600",
  },
  danger: {
    background: "rgba(255, 82, 82, 0.14)",
    border: "rgba(255, 82, 82, 0.24)",
    text: "#FF7C7C",
  },
  info: {
    background: "rgba(53, 194, 255, 0.14)",
    border: "rgba(53, 194, 255, 0.24)",
    text: "#35C2FF",
  },
} as const;

const LightTones = {
  primary: {
    background: "rgba(2, 195, 154, 0.16)",
    border: "rgba(2, 195, 154, 0.40)",
    text: "#08846C",
  },
  neutral: {
    background: "rgba(100, 116, 128, 0.12)",
    border: "rgba(100, 116, 128, 0.28)",
    text: "#51606A",
  },
  success: {
    background: "rgba(0, 176, 90, 0.16)",
    border: "rgba(0, 176, 90, 0.38)",
    text: "#0B8A45",
  },
  warning: {
    background: "rgba(214, 160, 0, 0.18)",
    border: "rgba(214, 160, 0, 0.42)",
    text: "#9A6B00",
  },
  danger: {
    background: "rgba(229, 57, 53, 0.14)",
    border: "rgba(229, 57, 53, 0.38)",
    text: "#C62828",
  },
  info: {
    background: "rgba(31, 134, 201, 0.14)",
    border: "rgba(31, 134, 201, 0.36)",
    text: "#1668A8",
  },
} as const;

export const Colors = {
  dark: {
    ...Brand,
    background: "#12161A",
    backgroundElement: "#1E252B",
    backgroundSelected: "#253039",
    surface: "#151B20",
    surfaceDeep: "#0F1418",
    panel: "#1A2127",
    overlay: "#0B0F13",
    border: "#2C3942",
    text: "#F4F7F8",
    textSecondary: "#94A3AE",
    textMeta: "#B6C1C8",
    textGhost: "#D3DBDF",
    placeholder: "#6D7A83",
    scrim: "rgba(0, 0, 0, 0.5)",
    tones: DarkTones,
  },
  light: {
    ...Brand,
    background: "#EEF1F4",
    backgroundElement: "#FFFFFF",
    backgroundSelected: "#E4EBEF",
    surface: "#FFFFFF",
    surfaceDeep: "#EDF1F3",
    panel: "#FFFFFF",
    overlay: "#FFFFFF",
    border: "#D6DDE2",
    text: "#11181D",
    textSecondary: "#5E6C75",
    textMeta: "#46535B",
    textGhost: "#46535B",
    placeholder: "#97A2A9",
    scrim: "rgba(0, 0, 0, 0.35)",
    tones: LightTones,
  },
} as const;

export type ThemeMode = keyof typeof Colors;
export type Palette = (typeof Colors)[ThemeMode];
// Chỉ các token có giá trị là màu (string) — loại trừ `tones` (object).
export type ThemeColor = {
  [K in keyof Palette]: Palette[K] extends string ? K : never;
}[keyof Palette];

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "var(--font-display)",
    serif: "var(--font-serif)",
    rounded: "var(--font-rounded)",
    mono: "var(--font-mono)",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
  seven: 96,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
