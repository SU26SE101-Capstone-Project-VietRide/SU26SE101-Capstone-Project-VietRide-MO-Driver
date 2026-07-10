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

// ===== Notification (prefix /api/v1) =====

export type AppNotification = {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
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
