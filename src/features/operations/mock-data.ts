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

// Lịch làm việc của crew theo ngày. Tạo tương đối quanh "hôm nay" để tuần/tháng
// đang xem luôn có ca, không phụ thuộc ngày chạy app.
export type ScheduleKind = "past" | "active" | "upcoming";

export type ScheduleEntry = {
  id: string;
  date: string; // YYYY-MM-DD (giờ địa phương)
  routeName: string;
  window: string;
  vehicleLabel: string;
  statusLabel: string;
  tone: Tone;
  kind: ScheduleKind;
};

function toLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildScheduleSeed(reference: Date): ScheduleEntry[] {
  const dateFromOffset = (offset: number) =>
    toLocalISODate(
      new Date(
        reference.getFullYear(),
        reference.getMonth(),
        reference.getDate() + offset,
      ),
    );

  const plan: {
    offset: number;
    routeName: string;
    window: string;
    vehicleLabel: string;
    kind: ScheduleKind;
    statusLabel: string;
    tone: Tone;
  }[] = [
    {
      offset: -6,
      routeName: "TP.HCM → Đà Lạt",
      window: "06:30 – 13:30",
      vehicleLabel: "51B-286.79",
      kind: "past",
      statusLabel: "Hoàn tất",
      tone: "success",
    },
    {
      offset: -3,
      routeName: "Đà Lạt → TP.HCM",
      window: "17:45 – 00:15",
      vehicleLabel: "51B-286.79",
      kind: "past",
      statusLabel: "Hoàn tất",
      tone: "success",
    },
    {
      offset: -1,
      routeName: "TP.HCM → Nha Trang",
      window: "07:00 – 15:00",
      vehicleLabel: "51B-301.22",
      kind: "past",
      statusLabel: "Hoàn tất",
      tone: "success",
    },
    {
      offset: 0,
      routeName: "TP.HCM → Đà Lạt",
      window: "06:30 – 13:30",
      vehicleLabel: "51B-286.79",
      kind: "active",
      statusLabel: "Đang chạy",
      tone: "primary",
    },
    {
      offset: 0,
      routeName: "Đà Lạt → TP.HCM",
      window: "17:45 – 00:15",
      vehicleLabel: "51B-286.79",
      kind: "upcoming",
      statusLabel: "Sắp tới",
      tone: "warning",
    },
    {
      offset: 1,
      routeName: "TP.HCM → Vũng Tàu",
      window: "08:00 – 10:30",
      vehicleLabel: "51B-118.40",
      kind: "upcoming",
      statusLabel: "Đã phân ca",
      tone: "info",
    },
    {
      offset: 3,
      routeName: "TP.HCM → Đà Lạt",
      window: "06:30 – 13:30",
      vehicleLabel: "51B-286.79",
      kind: "upcoming",
      statusLabel: "Đã phân ca",
      tone: "info",
    },
    {
      offset: 4,
      routeName: "Đà Lạt → TP.HCM",
      window: "17:45 – 00:15",
      vehicleLabel: "51B-286.79",
      kind: "upcoming",
      statusLabel: "Đã phân ca",
      tone: "info",
    },
    {
      offset: 8,
      routeName: "TP.HCM → Cần Thơ",
      window: "13:00 – 17:30",
      vehicleLabel: "51B-205.66",
      kind: "upcoming",
      statusLabel: "Đã phân ca",
      tone: "info",
    },
    {
      offset: 12,
      routeName: "TP.HCM → Đà Lạt",
      window: "06:30 – 13:30",
      vehicleLabel: "51B-286.79",
      kind: "upcoming",
      statusLabel: "Đã phân ca",
      tone: "info",
    },
    {
      offset: 15,
      routeName: "TP.HCM → Nha Trang",
      window: "07:00 – 15:00",
      vehicleLabel: "51B-301.22",
      kind: "upcoming",
      statusLabel: "Đã phân ca",
      tone: "info",
    },
    {
      offset: 20,
      routeName: "Đà Lạt → TP.HCM",
      window: "17:45 – 00:15",
      vehicleLabel: "51B-286.79",
      kind: "upcoming",
      statusLabel: "Đã phân ca",
      tone: "info",
    },
  ];

  return plan.map((item, index) => ({
    id: `sch-${index}`,
    date: dateFromOffset(item.offset),
    routeName: item.routeName,
    window: item.window,
    vehicleLabel: item.vehicleLabel,
    statusLabel: item.statusLabel,
    tone: item.tone,
    kind: item.kind,
  }));
}

export const assignmentsSeed = [
  {
    id: "asg-current",
    routeName: "SG → Đà Lạt",
    window: "06:30 - 13:30",
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

// Sơ đồ ghế dựng từ Vehicle.seatLayoutJson (source of truth — totalSeats +
// bố cục). Mỗi hàng có CÙNG số cột; null = lối đi để các cột thẳng hàng.
// Ghế không gắn passenger nào = ghế trống.
//
// buildSeatLayout2x2: bố cục ghế ngồi 2+2 (2 ghế · lối đi · 2 ghế), các hàng
// đầy 4 ghế, hàng cuối gom số ghế còn lại (tối đa 5, kiểu hàng băng ghế cuối).
export function buildSeatLayout2x2(totalSeats: number): (string | null)[][] {
  const pad = (value: number) => value.toString().padStart(2, "0");
  const rows: (string | null)[][] = [];
  let seat = 1;

  while (totalSeats - (seat - 1) > 5) {
    rows.push([pad(seat), pad(seat + 1), null, pad(seat + 2), pad(seat + 3)]);
    seat += 4;
  }

  const backRow: (string | null)[] = [];
  while (seat <= totalSeats) {
    backRow.push(pad(seat));
    seat += 1;
  }
  rows.push(backRow);

  return rows;
}

// Xe demo: 45 chỗ ghế ngồi 2+2 (10 hàng × 4 + băng ghế cuối 5 ghế).
export const seatLayoutSeed: (string | null)[][] = buildSeatLayout2x2(45);

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

export type NotificationSeed = {
  id: string;
  title: string;
  body: string;
  // Nhãn loại thông báo — dùng luôn làm tiêu chí lọc trên màn Thông báo.
  badge: string;
  // Tông màu icon/nhãn theo trạng thái.
  tone: Tone;
  // Thời điểm dạng tương đối, hiển thị cạnh tiêu đề.
  time: string;
};

export const notificationsSeed: NotificationSeed[] = [
  {
    id: "n-01",
    title: "Điều hành cập nhật giờ đến Trạm dừng Madagui",
    body: "Chuyến đang chậm 18 phút. Tổ xe giữ định vị liên tục, phụ xe ưu tiên đón khách nhanh tại Dầu Giây.",
    badge: "Trễ giờ",
    tone: "warning",
    time: "5 phút trước",
  },
  {
    id: "n-02",
    title: "Có 2 hành khách chưa xác nhận tại Dầu Giây",
    body: "Nếu rời điểm dừng, hệ thống sẽ đánh dấu khách có thể vắng mặt và ghi lại nhật ký.",
    badge: "Đón khách",
    tone: "danger",
    time: "12 phút trước",
  },
  {
    id: "n-03",
    title: "Kiện PC-240601-04 đã dỡ, chờ xác nhận giao",
    body: "Phụ xe cần quét mã hoặc xác nhận để gửi email báo cho người nhận.",
    badge: "Kiện hàng",
    tone: "info",
    time: "28 phút trước",
  },
  {
    id: "n-04",
    title: "Lịch chạy ngày mai đã được phân công",
    body: "Tuyến TP.HCM → Đà Lạt, khởi hành 06:30. Vui lòng kiểm tra xe và xác nhận trước 21:00 hôm nay.",
    badge: "Lịch chạy",
    tone: "primary",
    time: "1 giờ trước",
  },
  {
    id: "n-05",
    title: "Đã thu đủ phụ phí cân lại kiện PC-240601-02",
    body: "Khách đã thanh toán phần cân vượt. Kiện hàng sẵn sàng nhận lên xe.",
    badge: "Kiện hàng",
    tone: "success",
    time: "2 giờ trước",
  },
];

export const supportQuickPromptsSeed = [
  "Nếu chuyến trễ hơn 30 phút thì sao?",
  "Khi nào được dỡ hàng tại bến đích?",
  "Cần kiểm tra gì trước khi rời điểm dừng?",
];

// v1 navigation = deep link sang app bản đồ native (technical context mục 4.2 Driver):
// Android dùng `google.navigation:q=`, iOS dùng Apple Maps, web fallback Google Maps URL.
export function buildDirectionsUrl(
  destination: { lat: number; lng: number },
  platform: "ios" | "android" | "web",
) {
  const { lat, lng } = destination;

  if (platform === "android") {
    return `google.navigation:q=${lat},${lng}`;
  }

  if (platform === "ios") {
    return `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
