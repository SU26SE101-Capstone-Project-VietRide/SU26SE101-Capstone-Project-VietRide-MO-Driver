import {
    createContext,
    useContext,
    useState,
    type PropsWithChildren,
} from "react";

import {
    parcelsSeed,
    passengersSeed,
    routeStopsSeed,
    supportQuickPromptsSeed,
    tripSeed,
    type ParcelStatus,
    type Tone,
} from "./mock-data";

// Provider này CHỈ còn phục vụ các tính năng chưa có API thật (mock):
// hàng ký gửi (cargo), điểm dừng/confirm arrival (stops) và báo sự cố.
// Lịch làm việc, boarding, notifications, chat đã chuyển sang React Query
// hooks gọi API thật — xem src/features/trips, boarding, notifications.

type ParcelVM = {
  id: string;
  code: string;
  senderName: string;
  recipientName: string;
  pickupStopName: string;
  dropoffStopId: string;
  dropoffStopName: string;
  estimatedWeightKg: number;
  actualWeightKg: number | null;
  status: ParcelStatus;
  statusLabel: string;
  tone: Tone;
  // PENDING: chờ Assistant cân lại trước khi nhận lên xe.
  needsWeighing: boolean;
  // PENDING_ADDITIONAL_PAYMENT: cân vượt ước lượng, chờ KH trả phụ phí.
  awaitingAdditionalPayment: boolean;
  // Nhãn + trạng thái cho nút advance (LOADED→IN_TRANSIT→UNLOADED→DELIVERED).
  nextActionLabel: string | null;
  nextActionDisabled: boolean;
  nextActionHint: string | null;
  scanCode: string;
};

type OperationsContextValue = {
  advanceParcelStatus: (parcelId: string) => void;
  cargoMetrics: {
    loaded: number;
    total: number;
    onBoardWeightKg: number;
    maxCargoWeightKg: number;
    capacityPct: number;
    capacityTone: Tone;
    nearCapacity: boolean;
    unloadNext: number;
    pendingWeighing: number;
  };
  currentStop: (typeof routeStopsSeed)[number];
  currentStopArrived: boolean;
  markCurrentStopArrived: () => void;
  nextStop: (typeof routeStopsSeed)[number];
  parcels: ParcelVM[];
  pendingAtCurrentStopCount: number;
  routeStops: (typeof routeStopsSeed)[number][];
  settleAdditionalPayment: (parcelId: string) => void;
  trip: typeof tripSeed;
  weighParcel: (parcelId: string, actualWeightKg: number) => void;
};

const OperationsContext = createContext<OperationsContextValue | null>(null);

const CURRENT_STOP_ID = "stop-dau-giay";
const NEXT_STOP_ID = "stop-madagui";

// Bước advance kế tiếp khi bấm nút (chỉ cho nhánh "đi tới" sau khi đã LOADED).
const PARCEL_NEXT_STATUS: Partial<Record<ParcelStatus, ParcelStatus>> = {
  LOADED: "IN_TRANSIT",
  IN_TRANSIT: "UNLOADED",
  UNLOADED: "DELIVERED_PENDING_CONFIRM",
};

const PARCEL_STATUS_CONFIG: Record<
  ParcelStatus,
  { label: string; tone: Tone; action: string | null }
> = {
  PENDING: { label: "Chờ cân & nhận lên", tone: "warning", action: null },
  PENDING_ADDITIONAL_PAYMENT: {
    label: "Cân vượt — chờ phụ phí",
    tone: "danger",
    action: null,
  },
  LOADED: {
    label: "Đã nhận lên xe",
    tone: "success",
    action: "Chuyển IN_TRANSIT",
  },
  IN_TRANSIT: {
    label: "Đang vận chuyển",
    tone: "primary",
    action: "Xác nhận UNLOADED",
  },
  UNLOADED: {
    label: "Đã dỡ tại điểm",
    tone: "info",
    action: "Xác nhận giao hàng",
  },
  DELIVERED_PENDING_CONFIRM: {
    label: "Đã giao, chờ KH xác nhận",
    tone: "success",
    action: null,
  },
};

export const SUPPORT_QUICK_PROMPTS = supportQuickPromptsSeed;

export function OperationsProvider({ children }: PropsWithChildren) {
  const [currentStopArrived, setCurrentStopArrived] = useState(false);
  const [parcelStatuses, setParcelStatuses] = useState<
    Record<string, ParcelStatus>
  >(
    Object.fromEntries(parcelsSeed.map((parcel) => [parcel.id, parcel.status])),
  );
  const [actualWeights, setActualWeights] = useState<
    Record<string, number | null>
  >(Object.fromEntries(parcelsSeed.map((parcel) => [parcel.id, null])));

  const tripInProgress = tripSeed.status === "IN_PROGRESS";

  const currentStop =
    routeStopsSeed.find((stop) => stop.id === CURRENT_STOP_ID) ??
    routeStopsSeed[1];
  const nextStop =
    routeStopsSeed.find((stop) => stop.id === NEXT_STOP_ID) ??
    routeStopsSeed[2];

  // Màn stops (mock) vẫn hiển thị số khách chờ tại điểm hiện tại theo seed tĩnh.
  const pendingAtCurrentStopCount = passengersSeed.filter(
    (passenger) =>
      passenger.pickupStopId === CURRENT_STOP_ID &&
      passenger.boardingStatus !== "BOARDED",
  ).length;

  const parcels: ParcelVM[] = parcelsSeed.map((parcel) => {
    const status = parcelStatuses[parcel.id] ?? parcel.status;
    const config = PARCEL_STATUS_CONFIG[status];
    const actionLabel = config.action;

    // BR 4.2/6.6: chỉ được dỡ (IN_TRANSIT → UNLOADED) khi Trip IN_PROGRESS và
    // TripStop đích đã ARRIVED. Ở đây mock = đang ở đúng dropoff stop và đã bấm "Đã đến".
    const isUnloadStep = status === "IN_TRANSIT";
    const atDropoffStop = parcel.dropoffStopId === currentStop.id;
    const unloadBlocked =
      isUnloadStep && (!tripInProgress || !atDropoffStop || !currentStopArrived);

    let nextActionHint: string | null = null;
    if (isUnloadStep && !atDropoffStop) {
      nextActionHint = `Chỉ dỡ tại ${parcel.dropoffStopName}`;
    } else if (isUnloadStep && !currentStopArrived) {
      nextActionHint = "Bấm \"Đã đến\" điểm này trước khi dỡ";
    }

    return {
      ...parcel,
      status,
      actualWeightKg: actualWeights[parcel.id] ?? null,
      statusLabel: config.label,
      tone: config.tone,
      needsWeighing: status === "PENDING",
      awaitingAdditionalPayment: status === "PENDING_ADDITIONAL_PAYMENT",
      nextActionLabel: actionLabel,
      nextActionDisabled: unloadBlocked,
      nextActionHint,
    };
  });

  // totalLoadedWeightKg (BR 6.6e) = hàng đang vật lý trên xe = LOADED + IN_TRANSIT.
  const onBoardWeightKg = parcels
    .filter((parcel) => ["LOADED", "IN_TRANSIT"].includes(parcel.status))
    .reduce((sum, parcel) => sum + parcel.estimatedWeightKg, 0);
  const capacityPct = tripSeed.maxCargoWeightKg
    ? Math.round((onBoardWeightKg / tripSeed.maxCargoWeightKg) * 100)
    : 0;
  const nearCapacity = capacityPct >= 80;
  const cargoMetrics = {
    loaded: parcels.filter((parcel) =>
      ["LOADED", "IN_TRANSIT", "UNLOADED", "DELIVERED_PENDING_CONFIRM"].includes(
        parcel.status,
      ),
    ).length,
    total: parcels.length,
    onBoardWeightKg,
    maxCargoWeightKg: tripSeed.maxCargoWeightKg,
    capacityPct,
    capacityTone: (nearCapacity
      ? "danger"
      : capacityPct >= 60
        ? "warning"
        : "info") as Tone,
    nearCapacity,
    unloadNext: parcels.filter(
      (parcel) =>
        parcel.dropoffStopId === nextStop.id &&
        ["LOADED", "IN_TRANSIT"].includes(parcel.status),
    ).length,
    pendingWeighing: parcels.filter((parcel) =>
      ["PENDING", "PENDING_ADDITIONAL_PAYMENT"].includes(parcel.status),
    ).length,
  };
  const routeStops = routeStopsSeed.map((stop) => {
    if (stop.id === CURRENT_STOP_ID && currentStopArrived) {
      return {
        ...stop,
        statusLabel: "Đã đến",
        tone: "success" as Tone,
        note: "TripStop.actualArrivalTime đã được ghi nhận.",
      };
    }

    return stop;
  });

  return (
    <OperationsContext.Provider
      value={{
        advanceParcelStatus: (parcelId: string) => {
          setParcelStatuses((currentStatuses) => {
            const currentStatus = currentStatuses[parcelId];
            const nextStatus = PARCEL_NEXT_STATUS[currentStatus];

            if (!nextStatus) {
              return currentStatuses;
            }

            // Guard IN_TRANSIT → UNLOADED: chỉ khi Trip IN_PROGRESS, đang ở đúng
            // dropoff stop và stop đó đã ARRIVED (BR 4.2/6.6).
            if (currentStatus === "IN_TRANSIT") {
              const seed = parcelsSeed.find((parcel) => parcel.id === parcelId);
              const atDropoffStop = seed?.dropoffStopId === currentStop.id;

              if (!tripInProgress || !atDropoffStop || !currentStopArrived) {
                return currentStatuses;
              }
            }

            return { ...currentStatuses, [parcelId]: nextStatus };
          });
        },
        cargoMetrics,
        currentStop,
        currentStopArrived,
        markCurrentStopArrived: () => setCurrentStopArrived(true),
        nextStop,
        parcels,
        pendingAtCurrentStopCount,
        routeStops,
        settleAdditionalPayment: (parcelId: string) => {
          // KH đã trả phụ phí cân lại → quay về luồng nhận lên xe (LOADED).
          setParcelStatuses((currentStatuses) =>
            currentStatuses[parcelId] === "PENDING_ADDITIONAL_PAYMENT"
              ? { ...currentStatuses, [parcelId]: "LOADED" }
              : currentStatuses,
          );
        },
        trip: tripSeed,
        weighParcel: (parcelId: string, actualWeightKg: number) => {
          const seed = parcelsSeed.find((parcel) => parcel.id === parcelId);

          if (!seed) {
            return;
          }

          setActualWeights((current) => ({
            ...current,
            [parcelId]: actualWeightKg,
          }));

          // BR 6.6c: cân ≤ ước lượng → LOADED; cân > ước lượng → chờ phụ phí.
          setParcelStatuses((currentStatuses) => {
            if (currentStatuses[parcelId] !== "PENDING") {
              return currentStatuses;
            }

            const nextStatus: ParcelStatus =
              actualWeightKg > seed.estimatedWeightKg
                ? "PENDING_ADDITIONAL_PAYMENT"
                : "LOADED";

            return { ...currentStatuses, [parcelId]: nextStatus };
          });
        },
      }}
    >
      {children}
    </OperationsContext.Provider>
  );
}

export function useOperations() {
  const context = useContext(OperationsContext);

  if (!context) {
    throw new Error("useOperations must be used within OperationsProvider");
  }

  return context;
}
