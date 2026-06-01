export type CrewRole = "DRIVER" | "ASSISTANT";

export type Tone =
  | "primary"
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type StopStage = "COMPLETED" | "CURRENT" | "UPCOMING";

export type ParcelStatus =
  | "READY"
  | "LOADED"
  | "IN_TRANSIT"
  | "UNLOADED"
  | "DELIVERED_PENDING_CONFIRM";

export const tripSeed = {
  tripCode: "VR-SGDL-240601",
  routeName: "Bến xe Miền Đông → Bến xe Liên tỉnh Đà Lạt",
  vehicleLabel: "51B-286.79 • Limousine 34 chỗ",
  departureTime: "06:30",
  capacity: 34,
  totalParcels: 18,
  loadedParcels: 14,
  nextStopEta: "12 phút",
  liveDelayMinutes: 18,
  liveDelayLabel: "+18 phút",
  unloadAtNextStop: 2,
} as const;

export const routeStopsSeed = [
  {
    id: "stop-bxmd",
    shortName: "Miền Đông",
    name: "Bến xe Miền Đông",
    zone: "Thủ Đức, TP.HCM",
    stage: "COMPLETED" as StopStage,
    statusLabel: "Đã rời",
    timeLabel: "Kế hoạch 06:30 • Thực tế 06:42",
    tone: "success" as Tone,
    note: "Departure lock đã hoàn tất.",
  },
  {
    id: "stop-dau-giay",
    shortName: "Dầu Giây",
    name: "Ngã tư Dầu Giây",
    zone: "Đồng Nai",
    stage: "CURRENT" as StopStage,
    statusLabel: "Đang đón",
    timeLabel: "ETA 09:55 • Boarding window còn 4 phút",
    tone: "warning" as Tone,
    note: "2 khách chưa tick, 1 kiện cần nhận lên xe.",
  },
  {
    id: "stop-madagui",
    shortName: "Madagui",
    name: "Madagui Rest Stop",
    zone: "Lâm Đồng",
    stage: "UPCOMING" as StopStage,
    statusLabel: "Sắp tới",
    timeLabel: "ETA 11:10",
    tone: "primary" as Tone,
    note: "Dự kiến dỡ 2 parcel.",
  },
  {
    id: "stop-dalat",
    shortName: "Đà Lạt",
    name: "Bến xe Liên tỉnh Đà Lạt",
    zone: "Đà Lạt",
    stage: "UPCOMING" as StopStage,
    statusLabel: "Điểm cuối",
    timeLabel: "ETA 13:25",
    tone: "neutral" as Tone,
    note: "Kết thúc chuyến và đối soát parcel.",
  },
];

export const assignmentsSeed = [
  {
    id: "asg-current",
    routeName: "SG → Đà Lạt",
    window: "06:30 - 13:25",
    vehicleLabel: "51B-286.79 • Đang chạy",
    statusLabel: "In progress",
    tone: "primary" as Tone,
    primaryAction: "Tiếp tục chuyến",
    roleFocus: "Live ops",
  },
  {
    id: "asg-return",
    routeName: "Đà Lạt → SG",
    window: "17:45 - 00:15",
    vehicleLabel: "51B-286.79 • Chuẩn bị quay đầu",
    statusLabel: "Sắp tới",
    tone: "warning" as Tone,
    primaryAction: "Xem checklist",
    roleFocus: "Pre-departure",
  },
  {
    id: "asg-training",
    routeName: "Checklist SOP ca tối",
    window: "15:30 - 16:00",
    vehicleLabel: "Nội bộ vận hành",
    statusLabel: "Briefing",
    tone: "info" as Tone,
    primaryAction: "Mở hỗ trợ",
    roleFocus: "Crew note",
  },
];

export const passengersSeed = [
  {
    id: "p-01",
    bookingCode: "BK9D2M",
    buyerName: "Nguyễn Phúc An",
    contactPhone: "0909 221 774",
    seats: ["A01"],
    pickupStopId: "stop-bxmd",
    pickupStopName: "Bến xe Miền Đông",
    boardingStatus: "BOARDED" as const,
  },
  {
    id: "p-02",
    bookingCode: "BK3XZL",
    buyerName: "Trần Nhã Uyên",
    contactPhone: "0933 718 881",
    seats: ["A05", "A06"],
    pickupStopId: "stop-dau-giay",
    pickupStopName: "Ngã tư Dầu Giây",
    boardingStatus: "PENDING" as const,
  },
  {
    id: "p-03",
    bookingCode: "BK7QVP",
    buyerName: "Lê Hoài Khang",
    contactPhone: "0918 481 541",
    seats: ["B01"],
    pickupStopId: "stop-dau-giay",
    pickupStopName: "Ngã tư Dầu Giây",
    boardingStatus: "PENDING" as const,
  },
  {
    id: "p-04",
    bookingCode: "BK8ANM",
    buyerName: "Phạm Minh Hào",
    contactPhone: "0961 334 115",
    seats: ["B08"],
    pickupStopId: "stop-madagui",
    pickupStopName: "Madagui Rest Stop",
    boardingStatus: "PENDING" as const,
  },
  {
    id: "p-05",
    bookingCode: "BK1RKL",
    buyerName: "Đỗ Diễm Quỳnh",
    contactPhone: "0977 205 144",
    seats: ["C03"],
    pickupStopId: "stop-madagui",
    pickupStopName: "Madagui Rest Stop",
    boardingStatus: "PENDING" as const,
  },
];

export const parcelsSeed = [
  {
    id: "parcel-01",
    code: "PC-240601-01",
    senderName: "Anh Tuấn",
    recipientName: "Chị Hồng",
    pickupStopName: "Bến xe Miền Đông",
    dropoffStopName: "Madagui Rest Stop",
    weightKg: 12,
    status: "LOADED" as ParcelStatus,
    scanCode: "QR-AD91",
  },
  {
    id: "parcel-02",
    code: "PC-240601-02",
    senderName: "Shop Dâu Tây",
    recipientName: "Villa Lavie",
    pickupStopName: "Ngã tư Dầu Giây",
    dropoffStopName: "Bến xe Liên tỉnh Đà Lạt",
    weightKg: 18,
    status: "READY" as ParcelStatus,
    scanCode: "QR-CX11",
  },
  {
    id: "parcel-03",
    code: "PC-240601-03",
    senderName: "Nhà thuốc Linh",
    recipientName: "Anh Nam",
    pickupStopName: "Bến xe Miền Đông",
    dropoffStopName: "Bến xe Liên tỉnh Đà Lạt",
    weightKg: 6,
    status: "IN_TRANSIT" as ParcelStatus,
    scanCode: "QR-EA44",
  },
  {
    id: "parcel-04",
    code: "PC-240601-04",
    senderName: "Xưởng Mộc Gia Hân",
    recipientName: "Cafe Nova",
    pickupStopName: "Madagui Rest Stop",
    dropoffStopName: "Bến xe Liên tỉnh Đà Lạt",
    weightKg: 9,
    status: "UNLOADED" as ParcelStatus,
    scanCode: "QR-FZ02",
  },
];

export const notificationsSeed = [
  {
    id: "n-01",
    title: "Operator cập nhật ETA cho stop Madagui",
    body: "Trip đang chậm 18 phút. Crew giữ GPS liên tục, assistant ưu tiên boarding nhanh tại Dầu Giây.",
    badge: "Delay",
    tone: "warning" as Tone,
  },
  {
    id: "n-02",
    title: "Có 2 hành khách chưa tick tại Dầu Giây",
    body: "Nếu rời điểm dừng, hệ thống sẽ đánh dấu potentially no-show và ghi audit trail.",
    badge: "Boarding",
    tone: "danger" as Tone,
  },
  {
    id: "n-03",
    title: "Parcel PC-240601-04 đã dỡ, chờ giao xác nhận",
    body: "Assistant cần scan hoặc confirm để trigger email xác nhận cho người nhận.",
    badge: "Parcel",
    tone: "info" as Tone,
  },
];

export const supportQuickPromptsSeed = [
  "Nếu chuyến trễ hơn 30 phút thì sao?",
  "Khi nào được dỡ hàng tại bến đích?",
  "Checklist trước khi rời điểm dừng",
];
