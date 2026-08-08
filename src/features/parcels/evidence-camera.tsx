import { MaterialIcons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";

// Modal chụp ảnh bằng chứng nhận/giao kiện. Cùng khung với QrScannerModal
// (overlay tối cố định trên nền camera, không theo theme) nhưng thay scanner
// bằng nút chụp; trả uri ảnh cục bộ qua onCaptured để parent upload.
export function EvidenceCameraModal({
  visible,
  title,
  onCaptured,
  onClose,
}: {
  visible: boolean;
  title: string;
  onCaptured: (uri: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const takePhoto = async () => {
    if (capturing || !cameraRef.current) {
      return;
    }
    setCapturing(true);
    try {
      // quality 0.5 để ảnh chắc chắn dưới trần 5MB của Storage Rules.
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });
      if (photo?.uri) {
        onCaptured(photo.uri);
      }
    } catch {
      // Chụp lỗi (camera bị chiếm, thiếu bộ nhớ…) → giữ modal cho chụp lại.
    } finally {
      setCapturing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
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

        <View style={styles.overlay} pointerEvents="box-none">
          <Text style={styles.title}>{title}</Text>
          <View style={styles.bottomRow}>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <MaterialIcons name="close" size={20} color="#FFFFFF" />
              <Text style={styles.closeText}>Đóng</Text>
            </Pressable>
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
        </View>
      </View>
    </Modal>
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
