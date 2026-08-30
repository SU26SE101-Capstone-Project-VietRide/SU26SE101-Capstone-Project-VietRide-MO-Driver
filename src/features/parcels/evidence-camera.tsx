import { MaterialIcons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

// Modal chụp ảnh bằng chứng nhận/giao kiện. Cùng khung với QrScannerModal
// (overlay tối cố định trên nền camera, không theo theme) nhưng thay scanner
// bằng nút chụp; trả uri ảnh cục bộ qua onCaptured để parent upload.
export function EvidenceCameraModal({
  visible,
  title,
  count,
  max,
  onCaptured,
  onClose,
}: {
  visible: boolean;
  title: string;
  // Số ảnh ĐÃ giữ và mức trần — hiện ngay trong camera để phụ xe biết còn
  // chụp được mấy tấm nữa, khỏi đoán.
  count: number;
  max: number;
  onCaptured: (uri: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Ruột camera chỉ tồn tại khi modal mở: đóng lại là component unmount,
          ảnh đang chờ duyệt biến mất theo — không cần effect dọn state. */}
      {visible ? (
        <CameraBody
          title={title}
          count={count}
          max={max}
          onCaptured={onCaptured}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}

function CameraBody({
  title,
  count,
  max,
  onCaptured,
  onClose,
}: {
  title: string;
  count: number;
  max: number;
  onCaptured: (uri: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [capturing, setCapturing] = useState(false);
  // Ảnh vừa chụp, ĐANG CHỜ duyệt. Trước đây bấm nút là ảnh vào thẳng danh sách
  // bằng chứng — rung tay, ngược sáng, chụp trúng nền nhà là dính luôn, phải
  // quay ra xoá rồi chụp lại. Giờ xem trước rồi mới quyết.
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const takePhoto = async () => {
    if (capturing || !cameraRef.current) {
      return;
    }
    setCapturing(true);
    try {
      // quality 0.5 để ảnh chắc chắn dưới trần 5MB của Storage Rules.
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });
      if (photo?.uri) {
        setPreview(photo.uri);
      }
    } catch {
      // Chụp lỗi (camera bị chiếm, thiếu bộ nhớ…) → giữ modal cho chụp lại.
    } finally {
      setCapturing(false);
    }
  };

  const keepPhoto = () => {
    if (!preview) {
      return;
    }
    onCaptured(preview);
    // Xoá preview để chụp tiếp tấm nữa (tối đa 3 ảnh, parent tự đóng khi đủ).
    setPreview(null);
  };

  return (
    <View style={styles.container}>
        {permission?.granted ? (
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        ) : (
          <View style={styles.permissionBox}>
            <MaterialIcons name="no-photography" size={40} color="#FFFFFF" />
            <Text style={styles.permissionText}>
              {permission == null
                ? "Đang kiểm tra quyền camera…"
                : "Cần quyền camera để chụp ảnh bằng chứng."}
            </Text>
            {permission != null && !permission.granted ? (
              <Pressable
                style={styles.permissionButton}
                onPress={() =>
                  permission.canAskAgain
                    ? void requestPermission()
                    : void Linking.openSettings()
                }
              >
                <Text style={styles.permissionButtonText}>
                  {permission.canAskAgain ? "Cấp quyền" : "Mở cài đặt"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {/* Đã chụp: phủ ảnh lên camera để soi kỹ trước khi quyết. */}
        {preview ? (
          <Image source={{ uri: preview }} style={StyleSheet.absoluteFill} />
        ) : null}

        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.topRow}>
            <View style={styles.topTexts}>
              <Text style={styles.title}>{title}</Text>
              {/* Đang xem trước thì đếm cả tấm đang chờ duyệt, để biết bấm
                  "Dùng ảnh này" xong là đủ hay còn chụp tiếp được. */}
              <Text style={styles.counter}>
                {preview ? `Ảnh này là ${count + 1}/${max}` : `Đã có ${count}/${max} ảnh`}
              </Text>
            </View>
            {/* X luôn hiện, kể cả lúc xem trước — thoát camera là việc phải
                làm được ở mọi bước, không bắt bấm "Chụp lại" rồi mới đóng. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Đóng camera"
              hitSlop={10}
              style={styles.topClose}
              onPress={onClose}
            >
              <MaterialIcons name="close" size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          {preview ? (
            <View style={styles.bottomRow}>
              <Pressable style={styles.retakeButton} onPress={() => setPreview(null)}>
                <MaterialIcons name="refresh" size={20} color="#FFFFFF" />
                <Text style={styles.closeText}>Chụp lại</Text>
              </Pressable>
              <Pressable style={styles.keepButton} onPress={keepPhoto}>
                <MaterialIcons name="check" size={22} color="#111111" />
                <Text style={styles.keepText}>Dùng ảnh này</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.bottomRow}>
              {/* Đóng đã có nút X ở trên; dưới này chừa chỗ để nút chụp nằm
                  đúng giữa, ngón cái với tới dễ nhất. */}
              <View style={styles.spacer} />
              <Pressable
                style={[styles.shutter, capturing && styles.shutterDisabled]}
                disabled={capturing || !permission?.granted}
                onPress={() => void takePhoto()}
              >
                <MaterialIcons name="photo-camera" size={30} color="#111111" />
              </Pressable>
              {/* Giữ layout cân giữa — cùng bề rộng với nút Đóng. */}
              <View style={styles.spacer} />
            </View>
          )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 72,
    paddingBottom: 48,
    paddingHorizontal: 24,
  },
  topRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  topTexts: {
    flex: 1,
    gap: 4,
  },
  topClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  counter: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 6,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 6,
  },
  bottomRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.5)",
  },
  shutterDisabled: {
    opacity: 0.5,
  },
  spacer: {
    width: 92,
  },
  // Nút "Chụp lại" & "Dùng ảnh này" ở bước xem trước.
  retakeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  keepButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  keepText: {
    color: "#111111",
    fontSize: 16,
    fontWeight: "700",
  },
  closeButton: {
    width: 92,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  closeText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  permissionBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 32,
  },
  permissionText: {
    color: "#FFFFFF",
    fontSize: 15,
    textAlign: "center",
  },
  permissionButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#208AEF",
  },
  permissionButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});
