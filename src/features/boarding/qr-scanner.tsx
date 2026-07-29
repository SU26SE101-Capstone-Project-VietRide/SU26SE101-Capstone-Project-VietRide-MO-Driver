import { MaterialIcons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";

// Màn quét QR toàn màn hình (Modal). Dùng chung được cho vé khách (ticketCode)
// và sau này cho kiện hàng khi BE chốt QR parcel. Parent nhận chuỗi thô trong
// QR qua onScanned và tự quyết định gọi API nào.
//
// Overlay cố định tông tối trên nền camera nên không theo theme sáng/tối.
export function QrScannerModal({
  visible,
  title,
  hint,
  onScanned,
  onClose,
}: {
  visible: boolean;
  title: string;
  hint: string;
  onScanned: (data: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  // Chặn onBarcodeScanned bắn nhiều lần cho cùng một lần mở camera.
  const handledRef = useRef(false);

  useEffect(() => {
    if (visible) {
      handledRef.current = false;
      if (permission && !permission.granted && permission.canAskAgain) {
        void requestPermission();
      }
    }
  }, [visible, permission, requestPermission]);

  const handleBarcode = ({ data }: { data: string }) => {
    if (handledRef.current || !data.trim()) {
      return;
    }
    handledRef.current = true;
    onScanned(data.trim());
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
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleBarcode}
          />
        ) : (
          <View style={styles.permissionBox}>
            <MaterialIcons name="no-photography" size={40} color="#FFFFFF" />
            <Text style={styles.permissionText}>
              {permission == null
                ? "Đang kiểm tra quyền camera…"
                : "Cần quyền camera để quét mã QR."}
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
          <View style={styles.frame} />
          <Text style={styles.hint}>{hint}</Text>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <MaterialIcons name="close" size={20} color="#FFFFFF" />
            <Text style={styles.closeText}>Đóng</Text>
          </Pressable>
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
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    padding: 24,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 6,
  },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    borderRadius: 24,
    backgroundColor: "transparent",
  },
  hint: {
    color: "#FFFFFF",
    fontSize: 14,
    textAlign: "center",
    opacity: 0.9,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 6,
  },
  closeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
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
