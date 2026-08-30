import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Fonts, Spacing, type Palette } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/hooks/use-theme";

// Ô chọn ảnh bằng chứng: dãy ảnh vuông + một ô "thêm ảnh" cùng cỡ.
//
// Bản cũ có hai vấn đề: (1) chạm vào ảnh là XOÁ NGAY, không xem lại được — bấm
// nhầm là mất ảnh vừa chụp; (2) nút chụp là một nút chữ dài nằm cạnh mấy ô ảnh
// vuông nên hàng bị so le. Giờ chạm ảnh = xem to, muốn xoá thì bấm dấu × ở góc,
// và nút thêm ảnh cũng là một ô vuông cùng cỡ cho thẳng hàng.
export function EvidencePicker({
  uris,
  max,
  label,
  disabled = false,
  onAdd,
  onRemove,
}: {
  uris: string[];
  max: number;
  // "Ảnh bằng chứng" hoặc "Ảnh hiện trường" — chữ dưới ô thêm ảnh.
  label: string;
  disabled?: boolean;
  onAdd: () => void;
  onRemove: (uri: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const [viewing, setViewing] = useState<string | null>(null);

  return (
    <View style={styles.row}>
      {uris.map((uri) => (
        <View key={uri} style={styles.tileWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xem ảnh"
            onPress={() => setViewing(uri)}
          >
            <Image source={{ uri }} style={styles.thumb} />
          </Pressable>
          {/* Nút xoá tách riêng ở góc: xoá phải là hành động có chủ đích. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Xoá ảnh"
            hitSlop={8}
            onPress={() => onRemove(uri)}
            style={styles.removeBadge}
          >
            <MaterialIcons name="close" size={14} color="#FFFFFF" />
          </Pressable>
        </View>
      ))}

      {uris.length < max ? (
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={onAdd}
          style={[styles.addTile, disabled && styles.addTileDisabled]}
        >
          <MaterialIcons
            name="photo-camera"
            size={22}
            color={theme.textSecondary}
          />
          <Text style={styles.addCount}>
            {uris.length}/{max}
          </Text>
        </Pressable>
      ) : null}

      {uris.length === 0 ? (
        <Text style={[styles.hint, styles.hintGrow]}>{label} (tuỳ chọn)</Text>
      ) : null}

      {/* Xem ảnh to — soi lại rồi mới quyết giữ hay xoá. */}
      <Modal
        visible={viewing != null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewing(null)}
        statusBarTranslucent
      >
        <View style={styles.viewerBackdrop}>
          {viewing ? (
            <Image
              source={{ uri: viewing }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          ) : null}
          <View style={styles.viewerActions}>
            <Pressable
              accessibilityRole="button"
              style={styles.viewerDelete}
              onPress={() => {
                if (viewing) {
                  onRemove(viewing);
                }
                setViewing(null);
              }}
            >
              <MaterialIcons name="delete" size={20} color="#FFFFFF" />
              <Text style={styles.viewerDeleteText}>Xoá ảnh</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.viewerClose}
              onPress={() => setViewing(null)}
            >
              <MaterialIcons name="check" size={20} color="#111111" />
              <Text style={styles.viewerCloseText}>Giữ ảnh</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const TILE = 64;

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: Spacing.two,
    },
    tileWrap: {
      // Chừa chỗ cho dấu × nhô ra góc trên phải.
      paddingRight: 6,
      paddingTop: 6,
    },
    thumb: {
      width: TILE,
      height: TILE,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    removeBadge: {
      position: "absolute",
      top: 0,
      right: 0,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.dangerSolid,
    },
    addTile: {
      width: TILE,
      height: TILE,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      marginTop: 6,
    },
    addTileDisabled: {
      opacity: 0.45,
    },
    addCount: {
      color: c.textSecondary,
      fontSize: 11,
      fontVariant: ["tabular-nums"],
      fontWeight: 600,
    },
    hint: {
      color: c.textSecondary,
      fontFamily: Fonts.rounded,
      fontSize: 12,
    },
    hintGrow: {
      flex: 1,
      flexShrink: 1,
    },
    viewerBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.92)",
      justifyContent: "center",
      gap: Spacing.four,
      padding: Spacing.four,
    },
    viewerImage: {
      flex: 1,
      width: "100%",
    },
    viewerActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: Spacing.three,
    },
    viewerDelete: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.4)",
    },
    viewerDeleteText: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: 600,
    },
    viewerClose: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 999,
      backgroundColor: "#FFFFFF",
    },
    viewerCloseText: {
      color: "#111111",
      fontSize: 15,
      fontWeight: 700,
    },
  });
