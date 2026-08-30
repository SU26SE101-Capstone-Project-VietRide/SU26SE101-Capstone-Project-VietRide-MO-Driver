import { Linking, Platform } from "react-native";

// Thông báo đổi xe do sự cố (docs/Implements/
// MOBILE-VEHICLE-SUBSTITUTION-PARCEL-TRANSFER.md §Crew mới nhận thông báo).
// Event nguồn `trip.trip.vehicle_substituted` gửi kèm vị trí sự cố để crew
// thay thế biết chạy tới đâu. App KHÔNG tự dựng tuyến cứu hộ hay tracking
// riêng cho đoạn này — chỉ mở ứng dụng bản đồ ngoài.

export type VehicleSubstitutionInfo = {
  incidentId: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  newTripId: string | null;
  newVehicleId: string | null;
  newVehiclePlateNumber: string | null;
  newDriverId: string | null;
  newAssistantId: string | null;
};

const SUBSTITUTION_TYPES = new Set(["VEHICLE_SUBSTITUTED", "VEHICLE_SWAPPED"]);

function str(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

// Push FCM gửi mọi field dạng string, REST gửi number → nhận cả hai. Toạ độ
// ngoài khoảng hợp lệ coi như không có, tránh mở bản đồ ra giữa đại dương.
function coord(
  data: Record<string, unknown>,
  key: string,
  max: number,
): number | null {
  const raw = data[key];
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim().length > 0
        ? Number(raw)
        : NaN;
  if (!Number.isFinite(value) || Math.abs(value) > max) {
    return null;
  }
  return value;
}

// Trả null khi không phải thông báo đổi xe hoặc payload rỗng — nơi gọi chỉ vẽ
// khối bổ sung khi có dữ liệu thật.
export function parseVehicleSubstitution(
  type: string,
  data: Record<string, unknown> | null | undefined,
): VehicleSubstitutionInfo | null {
  if (!SUBSTITUTION_TYPES.has(type.toUpperCase()) || !data) {
    return null;
  }

  const info: VehicleSubstitutionInfo = {
    incidentId: str(data, "incidentId"),
    latitude: coord(data, "incidentLatitude", 90),
    longitude: coord(data, "incidentLongitude", 180),
    description: str(data, "incidentDescription"),
    newTripId: str(data, "newTripId"),
    newVehicleId: str(data, "newVehicleId"),
    newVehiclePlateNumber: str(data, "newVehiclePlateNumber"),
    newDriverId: str(data, "newDriverId"),
    newAssistantId: str(data, "newAssistantId"),
  };

  const hasAnything =
    info.incidentId != null ||
    info.newTripId != null ||
    info.newVehiclePlateNumber != null ||
    info.description != null ||
    (info.latitude != null && info.longitude != null);

  return hasAnything ? info : null;
}

// Chỉ mở được bản đồ khi có ĐỦ cặp toạ độ. Thiếu thì UI hiển thị mô tả sự cố
// (doc: cấm hiện chuỗi "null, null").
export function hasIncidentCoordinates(info: VehicleSubstitutionInfo): boolean {
  return info.latitude != null && info.longitude != null;
}

// Vị trí sự cố hiển thị cho crew: ưu tiên mô tả của điều hành vì dễ đọc hơn
// toạ độ; không có mô tả thì mới hiện số.
export function incidentLocationLabel(info: VehicleSubstitutionInfo): string {
  if (info.description) {
    return info.description;
  }
  if (hasIncidentCoordinates(info)) {
    return `${info.latitude?.toFixed(5)}, ${info.longitude?.toFixed(5)}`;
  }
  return "Điều hành chưa gửi vị trí sự cố";
}

// Mở app bản đồ mặc định của máy. iOS dùng scheme Apple Maps, Android dùng
// `geo:` để người dùng tự chọn app; cả hai fallback sang Google Maps web nếu
// không có app nào nhận scheme.
export async function openIncidentInMaps(
  info: VehicleSubstitutionInfo,
): Promise<boolean> {
  if (!hasIncidentCoordinates(info)) {
    return false;
  }

  const lat = info.latitude as number;
  const lng = info.longitude as number;
  const label = info.description ?? "Vị trí sự cố";
  const native =
    Platform.OS === "ios"
      ? `maps://?ll=${lat},${lng}&q=${encodeURIComponent(label)}`
      : `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(label)})`;
  const web = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  try {
    if (await Linking.canOpenURL(native)) {
      await Linking.openURL(native);
      return true;
    }
    await Linking.openURL(web);
    return true;
  } catch {
    return false;
  }
}
