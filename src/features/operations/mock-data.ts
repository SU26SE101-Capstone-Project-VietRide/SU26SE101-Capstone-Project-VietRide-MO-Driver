export type CrewRole = "DRIVER" | "ASSISTANT";

export type Tone =
  | "primary"
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type StopStage = "COMPLETED" | "CURRENT" | "UPCOMING";

export type TripStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED";

// Khớp ParcelStatus enum (technical context mục 8). Crew app chỉ thao tác
// các trạng thái vận hành tại bến: PENDING → (cân lại) → LOADED → IN_TRANSIT
// → UNLOADED → DELIVERED_PENDING_CONFIRM.
export type ParcelStatus =
  | "PENDING"
  | "PENDING_ADDITIONAL_PAYMENT"
  | "LOADED"
  | "IN_TRANSIT"
  | "UNLOADED"
  | "DELIVERED_PENDING_CONFIRM";

export const tripSeed = {
  tripCode: "VR-SGDL-240601",
  routeName: "Bến xe Miền Đông Mới → Bến xe Liên tỉnh Đà Lạt",
  vehicleLabel: "51B-286.79 • Ghế ngồi 45 chỗ",
  departureTime: "06:30",
  status: "IN_PROGRESS" as TripStatus,
  capacity: 45,
  // Khoang hàng của xe (Vehicle.maxCargoWeightKg) — dùng cho cảnh báo ≥80%.
  maxCargoWeightKg: 120,
  estimatedPassengerLuggageKg: 90,
  nextStopEta: "12 phút",
  liveDelayMinutes: 18,
  liveDelayLabel: "+18 phút",
} as const;

// Tuyến SG → Đà Lạt theo QL20 (~305 km, ~7 tiếng). Các mốc dừng quen thuộc:
// Bến xe Miền Đông Mới → ngã ba Dầu Giây → Trạm dừng Madagui (Đạ Huoai) →
// Bảo Lộc (trước đèo Bảo Lộc) → Bến xe Liên tỉnh Đà Lạt.
export const routeStopsSeed = [
  {
    id: "stop-bxmd",
    shortName: "Miền Đông",
    name: "Bến xe Miền Đông Mới",
    zone: "TP. Thủ Đức, TP.HCM",
    lat: 10.8275,
    lng: 106.8127,
    stage: "COMPLETED" as StopStage,
    statusLabel: "Đã rời",
    timeLabel: "Dự kiến 06:30 • Thực tế 06:42",
    tone: "success" as Tone,
    note: "Đã chốt rời bến.",
  },
  {
    id: "stop-dau-giay",
    shortName: "Dầu Giây",
    name: "Ngã ba Dầu Giây",
    zone: "Thống Nhất, Đồng Nai",
    lat: 10.951,
    lng: 107.149,
    stage: "CURRENT" as StopStage,
    statusLabel: "Đang đón",
    timeLabel: "Dự kiến đến 08:15 • Còn 4 phút đón khách",
    tone: "warning" as Tone,
    note: "2 khách chưa xác nhận, 1 kiện cần nhận lên xe.",
  },
  {
    id: "stop-madagui",
    shortName: "Madagui",
    name: "Trạm dừng Madagui",
    zone: "Đạ Huoai, Lâm Đồng",
    lat: 11.4628,
    lng: 107.5503,
    stage: "UPCOMING" as StopStage,
    statusLabel: "Sắp tới",
    timeLabel: "Dự kiến đến 10:20",
    tone: "primary" as Tone,
    note: "Nghỉ giải lao 20 phút • dự kiến dỡ 2 kiện.",
  },
  {
    id: "stop-bao-loc",
    shortName: "Bảo Lộc",
    name: "Bến xe Bảo Lộc",
    zone: "TP. Bảo Lộc, Lâm Đồng",
    lat: 11.5475,
    lng: 107.8085,
    stage: "UPCOMING" as StopStage,
    statusLabel: "Sắp tới",
    timeLabel: "Dự kiến đến 11:30",
    tone: "primary" as Tone,
    note: "Đón khách trước khi lên đèo Bảo Lộc.",
  },
  {
    id: "stop-dalat",
    shortName: "Đà Lạt",
    name: "Bến xe Liên tỉnh Đà Lạt",
    zone: "TP. Đà Lạt, Lâm Đồng",
    lat: 11.9258,
    lng: 108.4407,
    stage: "UPCOMING" as StopStage,
    statusLabel: "Điểm cuối",
    timeLabel: "Dự kiến đến 13:30",
    tone: "neutral" as Tone,
    note: "Kết thúc chuyến và đối soát kiện hàng.",
  },
];

// ScheduleEntry giờ là view-model của màn lịch (data thật từ
// GET /v1/driver/me/schedule được map về shape này trong role-screens).
export type ScheduleKind = "past" | "active" | "upcoming";

export type ScheduleEntry = {
  id: string;
  date: string; // YYYY-MM-DD (giờ địa phương)
  // Tách điểm đi/điểm đến thay vì một chuỗi "A → B": mũi tên luôn nằm đầu dòng
  // thứ hai nên layout không đổi theo độ dài tên bến.
  originName: string;
  destinationName: string;
  window: string;
  vehicleLabel: string;
  statusLabel: string;
  tone: Tone;
  kind: ScheduleKind;
};

// Seed khách còn lại chỉ để màn stops (mock) đếm khách chờ tại điểm hiện tại.
export const passengersSeed = [
  {
    id: "p-01",
    bookingCode: "BK9D2M",
    buyerName: "Nguyễn Phúc An",
    contactPhone: "0909 221 774",
    seats: ["01"],
    pickupStopId: "stop-bxmd",
    pickupStopName: "Bến xe Miền Đông",
    boardingStatus: "BOARDED" as const,
  },
  {
    id: "p-02",
    bookingCode: "BK3XZL",
    buyerName: "Trần Nhã Uyên",
    contactPhone: "0933 718 881",
    seats: ["05", "06"],
    pickupStopId: "stop-dau-giay",
    pickupStopName: "Ngã ba Dầu Giây",
    boardingStatus: "PENDING" as const,
  },
  {
    id: "p-03",
    bookingCode: "BK7QVP",
    buyerName: "Lê Hoài Khang",
    contactPhone: "0918 481 541",
    seats: ["07"],
    pickupStopId: "stop-dau-giay",
    pickupStopName: "Ngã ba Dầu Giây",
    boardingStatus: "PENDING" as const,
  },
  {
    id: "p-04",
    bookingCode: "BK8ANM",
    buyerName: "Phạm Minh Hào",
    contactPhone: "0961 334 115",
    seats: ["31"],
    pickupStopId: "stop-madagui",
    pickupStopName: "Trạm dừng Madagui",
    boardingStatus: "PENDING" as const,
  },
  {
    id: "p-05",
    bookingCode: "BK1RKL",
    buyerName: "Đỗ Diễm Quỳnh",
    contactPhone: "0977 205 144",
    seats: ["45"],
    pickupStopId: "stop-madagui",
    pickupStopName: "Trạm dừng Madagui",
    boardingStatus: "PENDING" as const,
  },
];

export const parcelsSeed = [
  {
    id: "parcel-01",
    code: "PC-240601-01",
    senderName: "Anh Tuấn",
    recipientName: "Chị Hồng",
    pickupStopName: "Bến xe Miền Đông Mới",
    dropoffStopId: "stop-madagui",
    dropoffStopName: "Trạm dừng Madagui",
    estimatedWeightKg: 12,
    status: "LOADED" as ParcelStatus,
    scanCode: "QR-AD91",
  },
  {
    id: "parcel-02",
    code: "PC-240601-02",
    senderName: "Shop Dâu Tây",
    recipientName: "Villa Lavie",
    pickupStopName: "Ngã ba Dầu Giây",
    dropoffStopId: "stop-dalat",
    dropoffStopName: "Bến xe Liên tỉnh Đà Lạt",
    estimatedWeightKg: 18,
    status: "PENDING" as ParcelStatus,
    scanCode: "QR-CX11",
  },
  {
    id: "parcel-03",
    code: "PC-240601-03",
    senderName: "Nhà thuốc Linh",
    recipientName: "Anh Nam",
    pickupStopName: "Bến xe Miền Đông Mới",
    dropoffStopId: "stop-madagui",
    dropoffStopName: "Trạm dừng Madagui",
    estimatedWeightKg: 6,
    status: "IN_TRANSIT" as ParcelStatus,
    scanCode: "QR-EA44",
  },
  {
    id: "parcel-04",
    code: "PC-240601-04",
    senderName: "Xưởng Mộc Gia Hân",
    recipientName: "Cafe Nova",
    pickupStopName: "Bến xe Miền Đông Mới",
    dropoffStopId: "stop-dau-giay",
    dropoffStopName: "Ngã ba Dầu Giây",
    estimatedWeightKg: 9,
    status: "UNLOADED" as ParcelStatus,
    scanCode: "QR-FZ02",
  },
];

export const supportQuickPromptsSeed = [
  "Nếu chuyến trễ hơn 30 phút thì sao?",
  "Khi nào được dỡ hàng tại bến đích?",
  "Cần kiểm tra gì trước khi rời điểm dừng?",
];
