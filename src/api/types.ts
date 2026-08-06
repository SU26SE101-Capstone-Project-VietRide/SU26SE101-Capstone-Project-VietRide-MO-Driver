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

export type TripStopStatus = "PENDING" | "ARRIVED" | "SKIPPED";

export type TripStop = {
  stopId: string;
  orderIndex: number;
  allowPickup: boolean;
  allowDropoff: boolean;
  estimatedArrivalTime: string;
  distanceFromOriginKm: number | null;
  fareFromThisStop: number | null;
  // Trạng thái vận hành. Chỉ ARRIVED mới có actualArrivalTime; PENDING và
  // SKIPPED đều null. Khai báo string để không vỡ nếu backend thêm giá trị mới.
  status: TripStopStatus | string;
  actualArrivalTime: string | null;
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
  // Mốc xe tới bến cuối. null cho tới khi driver/assistant xác nhận.
  // KHÔNG đồng nghĩa chuyến đã hoàn tất — xem completeTrip.
  destinationArrivedAt?: string | null;
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
  passengerRecordId: string;
  ticketId?: string;
  ticketCode?: string;
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

// Đủ 22 trạng thái theo doc §ParcelStatus (Settlement v2); để union string,
// parse defensive ở UI. PENDING/PENDING_ADDITIONAL_PAYMENT là legacy (migration
// map sang RESERVED/PENDING_FINAL_PAYMENT), giữ lại để đọc dữ liệu cũ.
export type ParcelStatus =
  | "PENDING_OPERATOR_REVIEW"
  | "PENDING_PAYMENT"
  | "PENDING"
  | "PENDING_ADDITIONAL_PAYMENT"
  | "RESERVED"
  | "CHECKED_IN"
  | "PENDING_FINAL_PAYMENT"
  | "READY_TO_LOAD"
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

export type ParcelSizeCategory = "SMALL" | "MEDIUM" | "LARGE" | "EXTRA_LARGE";

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
  photoUrl: string | null;
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
  // Settlement v2: số đo/giá ước tính và thực tế do backend snapshot + tính lại.
  estimatedSizeCategory: string | null;
  actualSizeCategory: string | null;
  estimatedLengthCm: number | null;
  estimatedWidthCm: number | null;
  estimatedHeightCm: number | null;
  estimatedVolumeM3: number | null;
  estimatedDimWeightKg: number | null;
  estimatedChargeableWeightKg: number | null;
  actualLengthCm: number | null;
  actualWidthCm: number | null;
  actualHeightCm: number | null;
  actualVolumeM3: number | null;
  actualDimWeightKg: number | null;
  actualChargeableWeightKg: number | null;
  estimatedGrossPriceVnd: number | null;
  finalGrossPriceVnd: number | null;
  discountAmountVnd: number | null;
  estimatedTotalPriceVnd: number | null;
  finalTotalPriceVnd: number | null;
  depositPercent: number | null;
  depositRequiredVnd: number | null;
  depositPaidVnd: number | null;
  balanceRequiredVnd: number | null;
  balancePaidVnd: number | null;
  refundDueVnd: number | null;
  refundedAmountVnd: number | null;
  forfeitedDepositVnd: number | null;
  depositPaymentId: string | null;
  balancePaymentId: string | null;
  // Deadline settlement v2 (xem doc §Deadline).
  loadCutoffAt: string | null;
  latestCheckInAt: string | null;
  checkedInAt: string | null;
  checkedInByUserId: string | null;
  reweighedAt: string | null;
  reweighedByUserId: string | null;
  finalPaymentDeadline: string | null;
  pricePerKgVnd: number | null;
  minimumPriceVnd: number | null;
  dimWeightFactor: number | null;
  settlementPolicyVersion: number | null;
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
// Settlement v2 thêm số đo thực tế + tiền còn thiếu để Assistant biết kiện nào
// khách chưa trả nốt trước khi load.
export type AssistantParcelItem = {
  parcelId: string;
  parcelCode: string;
  status: string;
  recipientName: string | null;
  recipientPhone: string | null;
  dropoffStopId: string | null;
  sizeCategory: string | null;
  estimatedSizeCategory: string | null;
  actualSizeCategory: string | null;
  estimatedWeightKg: number | null;
  actualWeightKg: number | null;
  balanceRequiredVnd: number | null;
  balancePaidVnd: number | null;
  finalPaymentDeadline: string | null;
  description: string | null;
  photoUrl: string | null;
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

// POST /v1/assistant/parcels/{id}/check-in — xác nhận sender mang kiện tới bến.
// RESERVED -> CHECKED_IN, phải trước latestCheckInAt.
export type CheckInParcelData = {
  parcelId: string;
  parcelCode: string;
  status: string;
  checkedInAt: string;
  latestCheckInAt: string | null;
};

// POST /v1/assistant/parcels/{id}/reweigh — Settlement v2: backend tự suy size
// và tính lại giá cuối/balance/refund từ 4 số đo; FE không gửi size hay payment.
export type ReweighParcelData = {
  parcelId: string;
  parcelCode: string;
  status: string;
  actualSizeCategory: string | null;
  actualChargeableWeightKg: number;
  finalGrossPriceVnd: number;
  discountAmountVnd: number;
  finalTotalPriceVnd: number;
  depositPaidVnd: number;
  balanceRequiredVnd: number;
  refundDueVnd: number;
  finalPaymentDeadline: string | null;
};

// POST /v1/assistant/parcels/{id}/load — scan xếp kiện lên xe.
// READY_TO_LOAD -> LOADED, Trip ledger chuyển reservation thành loaded cargo.
export type LoadParcelData = {
  parcelId: string;
  parcelCode: string;
  status: string;
};

// POST /v1/assistant/parcels/{id}/unload
export type UnloadParcelData = {
  parcelId: string;
  parcelCode: string;
  status: string;
};

// POST /v1/assistant/parcels/{id}/deliver — chuyển kiện đã dỡ sang chờ người
// nhận xác nhận. Sinh delivery token TTL 48 giờ (Day 39).
export type DeliverParcelData = {
  parcelId: string;
  status: string;
  deliveredPendingConfirmAt: string;
  deliveryTokenExpiresAt: string;
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

export type GeoPoint = { latitude: number; longitude: number };

// Marker bến (đầu/cuối). BE chỉ trả marker khi toạ độ hợp lệ, thiếu thì trả null
// nguyên object → luôn kiểm tra null trước khi dùng.
export type RouteGeometryStation = {
  stationId: string;
  name: string;
  latitude: number;
  longitude: number;
};

// Điểm dừng dọc đường. `sequence` là thứ tự hiển thị do BE cấp.
export type RouteGeometryStop = {
  stopId: string;
  name: string;
  sequence: number;
  latitude: number;
  longitude: number;
};

// GET /v1/tracking/trips/{tripId}/route-geometry — map context công khai của
// Tracking (Phase 12), dùng chung cho DRIVER và ASSISTANT được gán chuyến.
// QUAN TRỌNG: geometry = null nghĩa là tuyến CHƯA có đường đi thật; doc cấm
// client tự nối các marker thành tuyến giả — chỉ được hiện marker.
export type TripRouteGeometryData = {
  tripId: string;
  geometry: { source: "ROUTE_POLYLINE"; points: GeoPoint[] } | null;
  originStation: RouteGeometryStation | null;
  intermediateStops: RouteGeometryStop[];
  destinationStation: RouteGeometryStation | null;
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

// Broadcast eta:update — server đẩy sau mỗi lần tính lại ETA. Giống TripEta của
// REST nhưng có thêm cờ `delayed`; stopId do server chọn, KHÔNG chắc trùng stop
// mà app đang hiển thị.
export type EtaUpdateEvent = TripEta & { delayed?: boolean };

// Broadcast trip:statusChanged — hiện chỉ phát khi delay detection đánh dấu trễ.
export type TripStatusChangedEvent = {
  tripId: string;
  stopId: string;
  status: string;
  delayMinutes: number;
  updatedAt: string;
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

// ===== Driver operations (Day 39) =====

// 5 giá trị case-sensitive, backend từ chối giá trị ngoài danh sách.
export const INCIDENT_CATEGORIES = [
  "TRAFFIC_JAM",
  "VEHICLE_BREAKDOWN",
  "ACCIDENT",
  "WEATHER",
  "OTHER",
] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

// Body POST /v1/driver/trips/{tripId}/incident. Toạ độ đi theo cặp hoặc bỏ cả
// hai; description tối đa 500 ký tự; photoUrls tối đa 3 URL HTTPS tuyệt đối.
export type ReportIncidentInput = {
  category: IncidentCategory;
  description?: string | null;
  photoUrls?: string[];
  latitude?: number;
  longitude?: number;
};

export type ReportIncidentData = {
  incidentId: string;
  tripId: string;
  reportedByUserId: string;
  category: IncidentCategory;
  description: string | null;
  photoUrls: string[];
  latitude: number | null;
  longitude: number | null;
  reportedAt: string;
};

// POST /v1/driver/trips/{tripId}/stops/{stopId}/arrive
export type StopArrivalData = {
  tripId: string;
  stopId: string;
  status: string;
  actualArrivalTime: string;
};

// POST /v1/driver/trips/{tripId}/destination/arrive — KHÔNG hoàn tất chuyến,
// Trip vẫn giữ IN_PROGRESS. Chỉ đặt mốc đã tới bến cuối để mở khoá dỡ kiện.
export type DestinationArrivalData = {
  tripId: string;
  destinationStationId: string;
  status: string;
  actualArrivalTime: string;
};

// POST /v1/driver/trips/{tripId}/complete
export type CompleteTripData = {
  tripId: string;
  status: string;
  completedAt: string;
};

// ===== Đề xuất đổi tuyến (API driver route change proposals) =====

// Điểm dừng của tuyến thay thế. CHÚ Ý: chỉ có stopId, backend KHÔNG trả tên và
// toạ độ ở endpoint này → không vẽ được marker trên bản đồ xem trước.
export type AlternativeRouteStop = {
  alternativeRouteId: string;
  stopId: string;
  orderIndex: number;
  estimatedDurationFromOriginMinutes: number;
  distanceFromOriginKm: number | null;
  createdAt: string;
  updatedAt: string;
};

// GET /v1/driver/trips/{tripId}/alternative-routes — tuyến thay thế nhà xe đã
// cấu hình sẵn cho Route chính của chuyến. Các field số/mô tả có thể null.
export type AlternativeRoute = {
  id: string;
  routeId: string;
  name: string;
  description: string | null;
  destinationStationId: string;
  totalDistanceKm: number | null;
  estimatedDurationMinutes: number | null;
  pathPolyline: string | null;
  isActive: boolean;
  stops: AlternativeRouteStop[];
  createdAt: string;
  updatedAt: string;
};

export type AlternativeRoutesData = {
  items: AlternativeRoute[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type RouteChangeProposalType = "EXISTING" | "CUSTOM";

export type RouteChangeProposalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "SUPERSEDED"
  | "EXPIRED";

// Lý do hệ thống tự chốt đề xuất (không do admin bấm từ chối).
export type RouteChangeProposalResolutionCode =
  | "ANOTHER_PROPOSAL_APPROVED"
  | "ROUTE_CHANGED_DIRECTLY"
  | "TRIP_NO_LONGER_EDITABLE"
  | "SOURCE_ROUTE_CHANGED";

export type RouteChangeProposalStopSnapshot = {
  stopId: string;
  orderIndex: number;
  estimatedDurationFromOriginMinutes: number;
  distanceFromOriginKm: number | null;
};

// Ảnh chụp tuyến tại thời điểm gửi đề xuất. Bất biến: KHÔNG fetch lại tuyến gốc
// để thay thế snapshot khi hiển thị lịch sử (doc mục 4.4).
export type RouteChangeProposalSnapshot = {
  name: string;
  description: string | null;
  destinationStationId: string;
  totalDistanceKm: number | null;
  estimatedDurationMinutes: number | null;
  pathPolyline: string | null;
  stops: RouteChangeProposalStopSnapshot[];
};

export type RouteChangeProposal = {
  id: string;
  tripId: string;
  operatorId: string;
  proposedByUserId: string;
  type: RouteChangeProposalType;
  status: RouteChangeProposalStatus;
  sourceAlternativeRouteId: string | null;
  sourceUpdatedAt: string | null;
  incidentId: string | null;
  reason: string;
  snapshot: RouteChangeProposalSnapshot;
  decidedByUserId: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  resolutionCode: RouteChangeProposalResolutionCode | null;
  supersededByProposalId: string | null;
  approvedAlternativeRouteId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RouteChangeProposalsData = {
  items: RouteChangeProposal[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

// App chỉ gửi type EXISTING. Backend từ chối field lạ (JsonUnmappedMemberHandling
// .Disallow) nên KHÔNG được đính kèm field UI vào body này.
export type CreateRouteChangeProposalInput = {
  type: "EXISTING";
  alternativeRouteId: string;
  incidentId: string | null;
  reason: string;
};
