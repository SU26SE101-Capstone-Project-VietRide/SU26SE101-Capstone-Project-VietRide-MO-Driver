// Types bám theo OpenAPI specs đã bắt từ https://api.vietride.online/docs
// (xem docs/api-reference-driver-assistant.md). Các field string như role,
// status không có enum trong spec → để string và parse defensive ở nơi dùng.

export type ApiErrorField = {
  field: string;
  message: string;
};

export type ApiErrorBody = {
  code: string;
  message: string;
  fields?: ApiErrorField[];
};

export type Envelope<T> = {
  success: boolean;
  statusCode: number;
  message?: string | null;
  data?: T;
  error?: ApiErrorBody;
  meta?: {
    traceId?: string;
    timestamp?: string;
  };
};

// ===== Identity =====

export type AuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  role: string | null;
  operatorId: string | null;
  status: string | null;
  avatarUrl?: string | null;
};

export type LoginData = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  user: AuthUser;
};

export type SetInitialPasswordData = {
  userId: string;
  status: string;
};

// forgot-password: backend trả email đã chuẩn hóa + TTL của OTP (phút).
export type ForgotPasswordData = {
  email: string;
  otpTtlMinutes: number;
};

// reset-password: cùng shape với set-initial (userId + status sau khi đổi).
export type ResetPasswordData = {
  userId: string;
  status: string;
};

// ===== Trip =====

export type ScheduleTrip = {
  tripId: string;
  operatorId: string;
  routeId: string;
  vehicleId: string;
  departureDateTime: string;
  estimatedArrivalTime: string;
  status: string;
  // Vai trò của user trong chuyến (driver / assistant) — backend trả string tự do.
  assignmentRole: string;
};

export type DriverScheduleData = {
  from: string;
  to: string;
  trips: ScheduleTrip[];
};

export type TripStop = {
  stopId: string;
  orderIndex: number;
  allowPickup: boolean;
  allowDropoff: boolean;
  estimatedArrivalTime: string;
  distanceFromOriginKm: number | null;
  fareFromThisStop: number | null;
};

export type TripDetails = {
  tripId: string;
  operatorId: string;
  routeId: string;
  vehicleId: string;
  status: string | null;
  departureDateTime: string;
  estimatedArrivalTime: string;
  baseFare: number;
  originStation: { id: string; name: string | null };
  destinationStation: { id: string; name: string | null };
  stops: TripStop[];
  seatSummary: { totalSeats: number; availableSeats: number };
  returnRouteId?: string | null;
  // Giá theo chặng (TripFareBreakdownDto). Backend luôn trả kèm trip detail.
  fareBreakdown?: {
    baseFare: number;
    stops: { stopId: string; fareFromThisStop: number }[];
  };
};

export type SeatCell = {
  seatNumber: string | null;
  status: string | null;
  type: string | null;
  row: number;
  col: number;
  deck: number;
};

export type SeatMapData = {
  tripId: string;
  vehicleType: string | null;
  seats: SeatCell[];
};

// ===== Booking / Boarding =====

export type ManifestItem = {
  seatNumber: string;
  bookingCode: string;
  pickupStop: string;
  boardingStatus: string;
};

export type QrScanResultItem = {
  seatNumber: string;
  boardingStatus: string;
};

export type BoardPassengerData = {
  passengerRecordId: string;
  boardingStatus: string;
  boardedAt: string;
  boardedAtStopId: string;
};

// ===== Parcel (ký gửi) =====

// Đủ 18 trạng thái theo doc §ParcelStatus; để union string, parse defensive ở UI.
export type ParcelStatus =
  | "PENDING_OPERATOR_REVIEW"
  | "PENDING_PAYMENT"
  | "PENDING"
  | "PENDING_ADDITIONAL_PAYMENT"
  | "LOADED"
  | "IN_TRANSIT"
  | "PENDING_TRANSFER_CONFIRM"
  | "TRANSFER_ESCALATED"
  | "UNLOADED"
  | "DELIVERED_PENDING_CONFIRM"
  | "DELIVERY_CONFIRMED"
  | "DELIVERY_REJECTED"
  | "RETURN_INITIATED"
  | "RETURNED"
  | "PENDING_OPERATOR_ACTION"
  | "CANCELLED"
  | "REJECTED"
  | "EXPIRED";

export type ParcelSizeCategory = "SMALL" | "MEDIUM" | "LARGE";

export type ParcelPaymentMethod = "WALLET" | "VNPAY";

// GET /v1/parcels/{parcelId} — chi tiết 1 kiện. status để string vì backend có thể
// bổ sung trạng thái mới; các mốc thời gian nullable theo vòng đời kiện.
export type ParcelDetail = {
  parcelId: string;
  parcelCode: string;
  status: string;
  senderUserId: string | null;
  recipientUserId: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  operatorId: string | null;
  tripId: string | null;
  dropoffStopId: string | null;
  description: string | null;
  sizeCategory: string | null;
  estimatedWeightKg: number | null;
  actualWeightKg: number | null;
  deliveryMethod: string | null;
  depositAmount: number | null;
  originalDepositAmount: number | null;
  discountAmount: number | null;
  voucherCode: string | null;
  voucherUsageId: string | null;
  additionalAmount: number | null;
  createdAt: string;
  loadedAt: string | null;
  unloadedAt: string | null;
  deliveredPendingConfirmAt: string | null;
  confirmedAt: string | null;
  rejectedAt: string | null;
  originStationName: string | null;
  destinationStationName: string | null;
  eta: string | null;
};

// GET /v1/assistant/trips/{tripId}/parcels — 1 kiện trong danh sách chuyến.
export type AssistantParcelItem = {
  parcelId: string;
  parcelCode: string;
  status: string;
  recipientName: string | null;
  recipientPhone: string | null;
  dropoffStopId: string | null;
  sizeCategory: string | null;
  estimatedWeightKg: number | null;
  description: string | null;
};

export type AssistantParcelListData = {
  items: AssistantParcelItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

// POST /v1/assistant/parcels/{id}/reweigh — kết quả cân lại + tính phụ thu/hoàn.
export type ReweighParcelData = {
  parcelId: string;
  parcelCode: string;
  status: string;
  actualChargeableWeightKg: number;
  totalPriceVnd: number;
  additionalAmount: number;
  refundAmount: number;
  // Có khi cần chuyển hướng thanh toán phần phụ thu (VNPAY…).
  paymentRedirectUrl: string | null;
};

// POST /v1/assistant/parcels/{id}/unload
export type UnloadParcelData = {
  parcelId: string;
  parcelCode: string;
  status: string;
};

// POST /v1/assistant/parcels/{id}/confirm-delivery — doc không nêu rõ shape data;
// giữ tối thiểu (parcelId + status), phần còn lại optional để không hứa sai field.
export type ConfirmParcelDeliveryData = {
  parcelId: string;
  status: string;
  parcelCode?: string;
  confirmedAt?: string | null;
};

// ===== Device token (push) =====

export type DevicePlatform = "ANDROID" | "IOS" | "WEB";

// POST /v1/auth/device-token — đăng ký/refresh FCM token của thiết bị.
export type DeviceTokenData = {
  userDeviceId: string;
  fcmToken: string;
  platform: string;
  isActive: boolean;
};

// ===== RAG feedback =====

// Chỉ đánh giá tiêu cực (-1) hoặc tích cực (1); backend không nhận 0.
export type RagRating = -1 | 1;

// POST /v1/rag/messages/:id/feedback — chỉ dùng id + rating ở UI, còn lại optional.
export type RagFeedbackData = {
  id: string;
  messageId: string;
  rating: number;
  conversationId?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
};

// ===== Route (vẽ tuyến trên bản đồ) =====

// Toạ độ station CÓ THỂ null (từng field độc lập) → luôn lọc trước khi vẽ.
export type RouteStation = {
  stationId: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
};

// Toạ độ stop non-null theo domain BE.
export type RouteStop = {
  stopId: string;
  name: string;
  latitude: number;
  longitude: number;
  orderIndex: number;
  estimatedArrivalTime: string;
  allowPickup: boolean;
  allowDropoff: boolean;
};

// GET /v1/driver/trips/{tripId}/route — dùng chung cho DRIVER và ASSISTANT.
// pathPolyline null = operator chưa vẽ hình học tuyến → app fallback nối qua stops.
export type TripRouteData = {
  tripId: string;
  routeId: string;
  pathPolyline: string | null;
  originStation: RouteStation;
  destinationStation: RouteStation;
  stops: RouteStop[];
};

// ===== Tracking =====

// Vị trí GPS mới nhất của trip (Redis). speedKmh/headingDeg optional.
export type TripLocation = {
  tripId: string;
  latitude: number;
  longitude: number;
  speedKmh?: number;
  headingDeg?: number;
  recordedAt: string;
};

export type LatestLocationData = {
  latest: TripLocation | null;
};

// 1 điểm trong GPS trail (Postgres). speedKmh/headingDeg có thể vắng nếu DB null.
export type GpsTrailItem = {
  id: string;
  tripId: string;
  latitude: number;
  longitude: number;
  speedKmh?: number;
  headingDeg?: number;
  recordedAt: string;
};

export type GpsTrailData = {
  items: GpsTrailItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

// ETA của trip tới 1 stop (Redis). null nếu chưa có cache hợp lệ.
export type TripEta = {
  tripId: string;
  stopId: string;
  etaMinutes: number;
  estimatedArrivalTime: string;
  distanceMeters: number;
  updatedAt: string;
};

export type TripEtaData = {
  eta: TripEta | null;
};

// Payload gửi lên qua Socket.IO event gps:update.
export type GpsUpdatePayload = {
  tripId: string;
  latitude: number;
  longitude: number;
  speedKmh?: number;
  headingDeg?: number;
  recordedAt: string;
};

// ===== Notification (prefix /v1) =====

export type AppNotification = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  // Backend trả null khi cột DB null → phải nullable, tránh crash khi truy cập.
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationListData = {
  items: AppNotification[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};
