import {
    createContext,
    useContext,
    useState,
    type PropsWithChildren,
} from "react";

import { useAuthenticatedSession } from "@/features/session/session-context";
import {
    assignmentsSeed,
    notificationsSeed,
    parcelsSeed,
    passengersSeed,
    routeStopsSeed,
    supportQuickPromptsSeed,
    tripSeed,
    type ParcelStatus,
    type Tone,
} from "./mock-data";

type PassengerVM = {
  id: string;
  bookingCode: string;
  buyerName: string;
  contactPhone: string;
  seats: string[];
  pickupStopId: string;
  pickupStopName: string;
  boarded: boolean;
  boardingStatusLabel: string;
  tone: Tone;
};

type ParcelVM = {
  id: string;
  code: string;
  senderName: string;
  recipientName: string;
  pickupStopName: string;
  dropoffStopName: string;
  weightKg: number;
  status: ParcelStatus;
  statusLabel: string;
  tone: Tone;
  nextActionLabel: string;
  scanCode: string;
};

type OperationsContextValue = {
  acknowledgeDepartureWarning: () => void;
  assignments: typeof assignmentsSeed;
  boardingMetrics: {
    boarded: number;
    pending: number;
  };
  cargoMetrics: {
    loaded: number;
    total: number;
    totalWeight: number;
    unloadNext: number;
  };
  currentStop: (typeof routeStopsSeed)[number];
  currentStopArrived: boolean;
  departureWarningAcknowledged: boolean;
  markCurrentStopArrived: () => void;
  nextStop: (typeof routeStopsSeed)[number];
  notifications: typeof notificationsSeed;
  parcels: ParcelVM[];
  passengers: PassengerVM[];
  pendingAtCurrentStopCount: number;
  role: ReturnType<typeof useAuthenticatedSession>["role"];
  routeProgress: {
    boarded: number;
  };
  routeStops: (typeof routeStopsSeed)[number][];
  togglePassengerBoarding: (passengerId: string) => void;
  toggleTracking: () => void;
  trackingEnabled: boolean;
  trip: typeof tripSeed;
  updateParcelStatus: (parcelId: string) => void;
};

const OperationsContext = createContext<OperationsContextValue | null>(null);

const CURRENT_STOP_ID = "stop-dau-giay";
const NEXT_STOP_ID = "stop-madagui";

const PARCEL_FLOW: ParcelStatus[] = [
  "READY",
  "LOADED",
  "IN_TRANSIT",
  "UNLOADED",
  "DELIVERED_PENDING_CONFIRM",
];

const PASSENGER_STATUS_CONFIG: Record<
  "BOARDED" | "PENDING",
  { label: string; tone: Tone }
> = {
  BOARDED: { label: "Đã lên xe", tone: "success" },
  PENDING: { label: "Chưa check-in", tone: "warning" },
};

const PARCEL_STATUS_CONFIG: Record<
  ParcelStatus,
  { label: string; tone: Tone; action: string }
> = {
  READY: { label: "Chờ nhận lên", tone: "warning", action: "Xác nhận LOADED" },
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
    label: "Đã dỡ tại bến",
    tone: "info",
    action: "Xác nhận giao hàng",
  },
  DELIVERED_PENDING_CONFIRM: {
    label: "Đã giao, chờ xác nhận",
    tone: "success",
    action: "Giữ trạng thái",
  },
};

export const SUPPORT_QUICK_PROMPTS = supportQuickPromptsSeed;

export function OperationsProvider({ children }: PropsWithChildren) {
  const { role } = useAuthenticatedSession();
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [departureWarningAcknowledged, setDepartureWarningAcknowledged] =
    useState(false);
  const [currentStopArrived, setCurrentStopArrived] = useState(false);
  const [boardedPassengerIds, setBoardedPassengerIds] = useState(
    new Set(
      passengersSeed
        .filter((passenger) => passenger.boardingStatus === "BOARDED")
        .map((passenger) => passenger.id),
    ),
  );
  const [parcelStatuses, setParcelStatuses] = useState<
    Record<string, ParcelStatus>
  >(
    Object.fromEntries(parcelsSeed.map((parcel) => [parcel.id, parcel.status])),
  );

  const passengers: PassengerVM[] = passengersSeed.map((passenger) => {
    const boarded = boardedPassengerIds.has(passenger.id);
    const config = PASSENGER_STATUS_CONFIG[boarded ? "BOARDED" : "PENDING"];

    return {
      ...passenger,
      boarded,
      boardingStatusLabel: config.label,
      tone: config.tone,
    };
  });

  const parcels: ParcelVM[] = parcelsSeed.map((parcel) => {
    const status = parcelStatuses[parcel.id] ?? parcel.status;
    const config = PARCEL_STATUS_CONFIG[status];

    return {
      ...parcel,
      status,
      statusLabel: config.label,
      tone: config.tone,
      nextActionLabel: config.action,
    };
  });

  const currentStop =
    routeStopsSeed.find((stop) => stop.id === CURRENT_STOP_ID) ??
    routeStopsSeed[1];
  const nextStop =
    routeStopsSeed.find((stop) => stop.id === NEXT_STOP_ID) ??
    routeStopsSeed[2];
  const boardingMetrics = {
    boarded: passengers.filter((passenger) => passenger.boarded).length,
    pending: passengers.filter((passenger) => !passenger.boarded).length,
  };
  const pendingAtCurrentStopCount = passengers.filter(
    (passenger) =>
      passenger.pickupStopId === CURRENT_STOP_ID && !passenger.boarded,
  ).length;
  const cargoMetrics = {
    loaded: parcels.filter((parcel) =>
      [
        "LOADED",
        "IN_TRANSIT",
        "UNLOADED",
        "DELIVERED_PENDING_CONFIRM",
      ].includes(parcel.status),
    ).length,
    total: parcels.length,
    totalWeight: parcels.reduce((sum, parcel) => sum + parcel.weightKg, 0),
    unloadNext: parcels.filter(
      (parcel) =>
        parcel.dropoffStopName === nextStop.name &&
        parcel.status !== "DELIVERED_PENDING_CONFIRM",
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
        acknowledgeDepartureWarning: () =>
          setDepartureWarningAcknowledged(true),
        assignments: assignmentsSeed,
        boardingMetrics,
        cargoMetrics,
        currentStop,
        currentStopArrived,
        departureWarningAcknowledged,
        markCurrentStopArrived: () => setCurrentStopArrived(true),
        nextStop,
        notifications: notificationsSeed,
        parcels,
        passengers,
        pendingAtCurrentStopCount,
        role,
        routeProgress: {
          boarded: boardingMetrics.boarded,
        },
        routeStops,
        togglePassengerBoarding: (passengerId: string) => {
          setBoardedPassengerIds((currentIds) => {
            const nextIds = new Set(currentIds);

            if (nextIds.has(passengerId)) {
              nextIds.delete(passengerId);
            } else {
              nextIds.add(passengerId);
            }

            return nextIds;
          });
          setDepartureWarningAcknowledged(false);
        },
        toggleTracking: () =>
          setTrackingEnabled((currentValue) => !currentValue),
        trackingEnabled,
        trip: tripSeed,
        updateParcelStatus: (parcelId: string) => {
          setParcelStatuses((currentStatuses) => {
            const currentStatus = currentStatuses[parcelId];
            const currentIndex = PARCEL_FLOW.indexOf(currentStatus);
            const nextStatus =
              PARCEL_FLOW[Math.min(currentIndex + 1, PARCEL_FLOW.length - 1)];

            return {
              ...currentStatuses,
              [parcelId]: nextStatus,
            };
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
