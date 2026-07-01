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
  // Light theme bám theo Figma App User: teal #2AC1BC / deep teal #006A67.
  primary: {
    background: "rgba(42, 193, 188, 0.16)",
    border: "rgba(42, 193, 188, 0.42)",
    text: "#006A67",
  },
  neutral: {
    background: "#EBEEF3",
    border: "rgba(60, 73, 72, 0.18)",
    text: "#3C4948",
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
    // Nền cho card "accent" (card chính): dark nâng sáng nhẹ, light dùng trắng.
    backgroundAccent: "#253039",
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
    // Override màu thương hiệu cho riêng light theme theo bảng màu Figma App User.
    primary: "#2AC1BC",
    primaryMuted: "#CFEDEB",
    // Nền xám trung tính rõ để card trắng + surface mint nổi hẳn, không bị
    // "trùng" với nền (tránh hiện tượng lẫn màu khi nền cũng tông mint).
    background: "#DFE5E8",
    backgroundElement: "#FFFFFF",
    backgroundSelected: "#C9E8E2",
    // Card "accent" ở light dùng nền trắng (như bento card Figma) thay vì tô mint
    // dễ trùng nền; phân tách nhờ nền xám phía sau + viền.
    backgroundAccent: "#FFFFFF",
    surface: "#FFFFFF",
    surfaceDeep: "#D6DDDF",
    panel: "#FFFFFF",
    overlay: "#FFFFFF",
    border: "#D2DADD",
    text: "#181C20",
    textSecondary: "#3C4948",
    textMeta: "#3C4948",
    textGhost: "#3C4948",
    placeholder: "#9AA6A4",
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
