/**
 * Trả về bảng màu (palette) theo chế độ sáng/tối mà người dùng đã chọn.
 * Chế độ được quản lý bởi ThemeModeProvider (features/theme/theme-mode).
 */

import { useMemo } from "react";

import { Colors, type Palette } from "@/constants/theme";
import { useThemeMode } from "@/features/theme/theme-mode";

export function useTheme(): Palette {
  const { mode } = useThemeMode();
  return Colors[mode];
}

/**
 * Tạo StyleSheet phụ thuộc theme. `factory` phải là hằng ở cấp module để
 * memo hoá theo palette hoạt động đúng.
 */
export function useThemedStyles<T>(factory: (colors: Palette) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}
