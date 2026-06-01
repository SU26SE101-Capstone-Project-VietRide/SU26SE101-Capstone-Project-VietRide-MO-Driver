import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { Fonts, Spacing } from "@/constants/theme";
import {
    SUPPORT_QUICK_PROMPTS,
    useOperations,
} from "@/features/operations/operations-context";
import {
    ActionButton,
    MetricTile,
    OperationsScreen,
    SectionTitle,
    StatusChip,
    SurfaceCard,
} from "@/features/operations/ui";
import { useAuthenticatedSession } from "@/features/session/session-context";

const INCIDENT_CATEGORIES = [
  "TRAFFIC_JAM",
  "VEHICLE_BREAKDOWN",
  "ACCIDENT",
  "WEATHER",
  "OTHER",
] as const;

type ChatMessage = {
  id: string;
  speaker: "user" | "assistant";
  text: string;
};

function buildAssistantReply(question: string, role: "DRIVER" | "ASSISTANT") {
  const normalizedQuestion = question.toLowerCase();

  if (
    normalizedQuestion.includes("trễ") ||
    normalizedQuestion.includes("delay")
  ) {
    return "Nếu ETA trễ hơn 30 phút, ưu tiên cập nhật operator và hành khách. Driver giữ GPS bật, Assistant rà lại danh sách stop và boarding pending.";
  }

  if (
    normalizedQuestion.includes("hàng") ||
    normalizedQuestion.includes("parcel")
  ) {
    return role === "ASSISTANT"
      ? "Parcel tại điểm đích cần đi đúng chuỗi UNLOADED → DELIVERED_PENDING_CONFIRM. Chỉ mở nút dỡ khi stop đích đã ARRIVED."
      : "Driver nên tập trung giữ tuyến và phối hợp với phụ xe về tải trọng, không ôm toàn bộ xác nhận parcel.";
  }

  return "RAG support cho crew nên trả lời ngắn, đúng quy trình và bám role hiện tại. Bạn có thể đưa tiếp tình huống cụ thể để nhận SOP phù hợp.";
}

export function DriverOverviewScreen() {
  const router = useRouter();
  const { displayName } = useAuthenticatedSession();
  const {
    assignments,
    currentStop,
    nextStop,
    pendingAtCurrentStopCount,
    routeProgress,
    toggleTracking,
    trackingEnabled,
    trip,
  } = useOperations();

  return (
    <OperationsScreen
      title="Buồng lái tài xế"
      subtitle={`${displayName} • ưu tiên GPS, điều hướng, tình trạng chuyến và sự cố.`}
    >
      <SurfaceCard accent delay={0}>
        <View style={styles.heroTopRow}>
          <StatusChip label="DRIVER" tone="primary" />
          <StatusChip
            label={trackingEnabled ? "GPS đang bật" : "GPS đang tắt"}
            tone={trackingEnabled ? "success" : "warning"}
          />
        </View>

        <SectionTitle
          title={trip.routeName}
          subtitle={`${trip.tripCode} • ${trip.departureTime} • ${trip.vehicleLabel}`}
        />

        <View style={styles.metricRow}>
          <MetricTile
            label="Điểm hiện tại"
            value={currentStop.name}
            hint={currentStop.zone}
            tone="neutral"
            compact
          />
          <MetricTile
            label="Điểm tiếp theo"
            value={nextStop.name}
            hint={`ETA ${trip.nextStopEta}`}
            tone="primary"
            compact
          />
        </View>

        <View style={styles.metricRow}>
          <MetricTile
            label="Đã đón"
            value={`${routeProgress.boarded}/${trip.capacity}`}
            hint="hành khách lên xe"
            tone="success"
            compact
          />
          <MetricTile
            label="Delay live"
            value={trip.liveDelayLabel}
            hint="đồng bộ operator"
            tone={trip.liveDelayMinutes > 20 ? "danger" : "info"}
            compact
          />
        </View>

        <View style={styles.actionRow}>
          <ActionButton
            label={trackingEnabled ? "Tắt GPS" : "Bật GPS"}
            tone="primary"
            onPress={toggleTracking}
          />
          <ActionButton
            label="Mở chuyến"
            tone="secondary"
            onPress={() => router.push("/driver/trip")}
          />
        </View>
      </SurfaceCard>

      <SurfaceCard delay={120}>
        <SectionTitle
          title="Điểm cần chú ý"
          subtitle="Tài xế cần nhìn ngay các cảnh báo có thể ảnh hưởng tới tiến độ hoặc an toàn chuyến."
        />

        <View style={styles.metricRow}>
          <MetricTile
            label="Khách pending"
            value={String(pendingAtCurrentStopCount)}
            hint={currentStop.shortName}
            tone={pendingAtCurrentStopCount > 0 ? "warning" : "success"}
            compact
          />
          <MetricTile
            label="Sự cố"
            value="Form ready"
            hint="gửi về operator"
            tone="danger"
            compact
          />
        </View>

        <View style={styles.actionRow}>
          <ActionButton
            label="Báo sự cố"
            tone="danger"
            onPress={() => router.push("/driver/incident")}
          />
          <ActionButton
            label="Mở hỗ trợ AI"
            tone="ghost"
            onPress={() => router.push("/driver/support")}
          />
        </View>
      </SurfaceCard>

      <AssignmentsSection
        assignments={assignments}
        onPrimaryAction={(index) =>
          router.push(index === 0 ? "/driver/trip" : "/driver/support")
        }
      />
    </OperationsScreen>
  );
}

export function AssistantOverviewScreen() {
  const router = useRouter();
  const { displayName } = useAuthenticatedSession();
  const {
    assignments,
    currentStop,
    nextStop,
    pendingAtCurrentStopCount,
    routeProgress,
    trip,
  } = useOperations();

  return (
    <OperationsScreen
      title="Điều phối phụ xe"
      subtitle={`${displayName} • ưu tiên boarding, parcel và xác nhận điểm dừng.`}
    >
      <SurfaceCard accent delay={0}>
        <View style={styles.heroTopRow}>
          <StatusChip label="ASSISTANT" tone="primary" />
          <StatusChip label="Boarding live" tone="warning" />
        </View>

        <SectionTitle
          title={trip.routeName}
          subtitle={`${trip.tripCode} • ${trip.departureTime} • ${trip.vehicleLabel}`}
        />

        <View style={styles.metricRow}>
          <MetricTile
            label="Điểm hiện tại"
            value={currentStop.name}
            hint={currentStop.zone}
            tone="warning"
            compact
          />
          <MetricTile
            label="Điểm tiếp theo"
            value={nextStop.name}
            hint={`ETA ${trip.nextStopEta}`}
            tone="primary"
            compact
          />
        </View>

        <View style={styles.metricRow}>
          <MetricTile
            label="Đã đón"
            value={`${routeProgress.boarded}/${trip.capacity}`}
            hint="hành khách đã tick"
            tone="success"
            compact
          />
          <MetricTile
            label="Parcel chờ dỡ"
            value={String(trip.unloadAtNextStop)}
            hint={nextStop.shortName}
            tone="info"
            compact
          />
        </View>

        <View style={styles.actionRow}>
          <ActionButton
            label="Mở boarding"
            tone="primary"
            onPress={() => router.push("/assistant/boarding")}
          />
          <ActionButton
            label="Mở hàng hóa"
            tone="secondary"
            onPress={() => router.push("/assistant/cargo")}
          />
        </View>
      </SurfaceCard>

      <SurfaceCard delay={120}>
        <SectionTitle
          title="Điểm cần xử lý ngay"
          subtitle="Phụ xe chịu trách nhiệm tránh sót khách và xác nhận đúng trạng thái tại từng điểm dừng."
        />

        <View style={styles.metricRow}>
          <MetricTile
            label="Chưa check-in"
            value={String(pendingAtCurrentStopCount)}
            hint={currentStop.shortName}
            tone={pendingAtCurrentStopCount > 0 ? "danger" : "success"}
            compact
          />
          <MetricTile
            label="Dừng kế tiếp"
            value={nextStop.shortName}
            hint="cần ARRIVED + rà hàng"
            tone="warning"
            compact
          />
        </View>

        <View style={styles.actionRow}>
          <ActionButton
            label="Mở điểm dừng"
            tone="secondary"
            onPress={() => router.push("/assistant/stops")}
          />
          <ActionButton
            label="Mở hỗ trợ AI"
            tone="ghost"
            onPress={() => router.push("/assistant/support")}
          />
        </View>
      </SurfaceCard>

      <AssignmentsSection
        assignments={assignments}
        onPrimaryAction={(index) =>
          router.push(
            index === 0 ? "/assistant/boarding" : "/assistant/support",
          )
        }
      />
    </OperationsScreen>
  );
}

export function DriverTripScreen() {
  const router = useRouter();
  const { currentStop, nextStop, pendingAtCurrentStopCount, routeStops, trip } =
    useOperations();

  return (
    <OperationsScreen
      title="Chuyến đang chạy"
      subtitle="Tài xế xem tiến trình tuyến, ETA và các mốc điều hướng mà không bị lẫn với tác vụ boarding của phụ xe."
    >
      <SurfaceCard accent delay={0}>
        <SectionTitle
          title={trip.routeName}
          subtitle={`${trip.tripCode} • ${trip.vehicleLabel}`}
        />

        <View style={styles.metricRow}>
          <MetricTile
            label="Hiện tại"
            value={currentStop.name}
            hint={currentStop.zone}
            tone="warning"
            compact
          />
          <MetricTile
            label="Kế tiếp"
            value={nextStop.name}
            hint={`ETA ${trip.nextStopEta}`}
            tone="primary"
            compact
          />
        </View>

        <View style={styles.metricRow}>
          <MetricTile
            label="Delay"
            value={trip.liveDelayLabel}
            hint="tracking service"
            tone={trip.liveDelayMinutes > 20 ? "danger" : "info"}
            compact
          />
          <MetricTile
            label="Pending boarding"
            value={String(pendingAtCurrentStopCount)}
            hint="để crew phối hợp"
            tone={pendingAtCurrentStopCount > 0 ? "warning" : "success"}
            compact
          />
        </View>

        <View style={styles.actionRow}>
          <ActionButton
            label="Mở báo sự cố"
            tone="danger"
            onPress={() => router.push("/driver/incident")}
          />
          <ActionButton
            label="Mở hỗ trợ"
            tone="ghost"
            onPress={() => router.push("/driver/support")}
          />
        </View>
      </SurfaceCard>

      <RouteStopsCard routeStops={routeStops} />
    </OperationsScreen>
  );
}

export function DriverIncidentScreen() {
  const { currentStop, trip } = useOperations();
  const [incidentCategory, setIncidentCategory] =
    useState<(typeof INCIDENT_CATEGORIES)[number]>("TRAFFIC_JAM");
  const [incidentDescription, setIncidentDescription] = useState("");
  const [incidentSubmitted, setIncidentSubmitted] = useState(false);

  return (
    <OperationsScreen
      title="Báo sự cố"
      subtitle="Screen riêng cho Driver để xử lý incident report nhanh, không trộn với flow boarding hay parcel."
    >
      <SurfaceCard accent delay={0}>
        <SectionTitle
          title={trip.routeName}
          subtitle={`${trip.tripCode} • tại ${currentStop.name}`}
        />

        <View style={styles.metricRow}>
          <MetricTile
            label="GPS context"
            value={currentStop.shortName}
            hint="đính kèm vị trí hiện tại"
            tone="info"
            compact
          />
          <MetricTile
            label="Operator sync"
            value="Realtime"
            hint="push notification"
            tone="danger"
            compact
          />
        </View>
      </SurfaceCard>

      <SurfaceCard delay={120}>
        <SectionTitle
          title="Chọn loại sự cố"
          subtitle="Payload gửi operator sẽ kèm tripId, vị trí hiện tại và mô tả tự do tối đa 500 ký tự."
        />

        <View style={styles.categoryWrap}>
          {INCIDENT_CATEGORIES.map((category) => (
            <ActionButton
              key={category}
              label={category}
              tone={incidentCategory === category ? "danger" : "secondary"}
              small
              onPress={() => setIncidentCategory(category)}
            />
          ))}
        </View>

        <TextInput
          multiline
          numberOfLines={4}
          maxLength={500}
          placeholder="Mô tả nhanh tình huống, ảnh sẽ được gắn ở bước tích hợp thật."
          placeholderTextColor="#6D7A83"
          style={styles.input}
          value={incidentDescription}
          onChangeText={setIncidentDescription}
        />

        <View style={styles.actionRow}>
          <ActionButton
            label="Mở chỉ đường"
            tone="secondary"
            onPress={() => setIncidentSubmitted(false)}
          />
          <ActionButton
            label="Gửi incident"
            tone="danger"
            onPress={() => setIncidentSubmitted(true)}
          />
        </View>

        {incidentSubmitted ? (
          <View style={styles.feedbackBanner}>
            <StatusChip label="Incident queued" tone="danger" />
            <Text style={styles.feedbackText}>
              {incidentCategory} đã được dựng thành payload nháp cho trip{" "}
              {trip.tripCode}.
            </Text>
          </View>
        ) : null}
      </SurfaceCard>
    </OperationsScreen>
  );
}

export function AssistantBoardingScreen() {
  const {
    acknowledgeDepartureWarning,
    boardingMetrics,
    currentStop,
    departureWarningAcknowledged,
    passengers,
    pendingAtCurrentStopCount,
    togglePassengerBoarding,
    trip,
  } = useOperations();

  return (
    <OperationsScreen
      title="Boarding hành khách"
      subtitle="Manifest và cảnh báo bỏ sót khách được tách riêng cho phụ xe, không chen vào cockpit của tài xế."
    >
      <SurfaceCard accent delay={0}>
        <SectionTitle
          title={trip.routeName}
          subtitle={`Boarding tại ${currentStop.name}`}
        />

        <View style={styles.metricRowBoarding}>
          <MetricTile
            label="Đã lên xe"
            value={String(boardingMetrics.boarded)}
            hint="confirmed"
            tone="success"
            compact
          />
          <MetricTile
            label="Chưa check-in"
            value={String(boardingMetrics.pending)}
            hint="toàn chuyến"
            tone="warning"
            compact
          />
          <MetricTile
            label="Tại điểm hiện tại"
            value={String(pendingAtCurrentStopCount)}
            hint="cần rà"
            tone={pendingAtCurrentStopCount > 0 ? "danger" : "success"}
            compact
          />
        </View>
      </SurfaceCard>

      {pendingAtCurrentStopCount > 0 && !departureWarningAcknowledged ? (
        <SurfaceCard delay={120}>
          <SectionTitle
            title="Avoid missing passengers"
            subtitle={`Còn ${pendingAtCurrentStopCount} hành khách PENDING tại ${currentStop.shortName}.`}
          />

          <Text style={styles.warningText}>
            Khi bấm rời điểm dừng, app cần chặn nhẹ và buộc crew xác nhận rằng
            những khách này có thể trở thành no-show.
          </Text>

          <View style={styles.actionRow}>
            <ActionButton
              label="Quay lại tick"
              tone="secondary"
              onPress={() => undefined}
            />
            <ActionButton
              label="Xác nhận rời điểm"
              tone="danger"
              onPress={acknowledgeDepartureWarning}
            />
          </View>
        </SurfaceCard>
      ) : null}

      <SurfaceCard delay={180}>
        <SectionTitle
          title="Manifest"
          subtitle="Hiển thị bookingCode, ghế, điểm đón, contact buyer và trạng thái boarding."
        />

        <View style={styles.listStack}>
          {passengers.map((passenger) => (
            <View key={passenger.id} style={styles.passengerCard}>
              <View style={styles.passengerTopRow}>
                <View style={styles.passengerHead}>
                  <Text style={styles.bookingCode}>
                    {passenger.bookingCode}
                  </Text>
                  <Text style={styles.passengerName}>
                    {passenger.buyerName}
                  </Text>
                </View>
                <StatusChip
                  label={passenger.boardingStatusLabel}
                  tone={passenger.tone}
                />
              </View>

              <View style={styles.passengerMetaWrap}>
                <Text style={styles.metaText}>
                  Ghế: {passenger.seats.join(", ")}
                </Text>
                <Text style={styles.metaText}>
                  Điểm đón: {passenger.pickupStopName}
                </Text>
                <Text style={styles.metaText}>
                  Liên hệ: {passenger.contactPhone}
                </Text>
              </View>

              <View style={styles.actionRow}>
                <ActionButton
                  label={passenger.boarded ? "Bỏ tick" : "Xác nhận lên xe"}
                  tone={passenger.boarded ? "ghost" : "primary"}
                  small
                  onPress={() => togglePassengerBoarding(passenger.id)}
                />
                <ActionButton
                  label="Scan QR"
                  tone="secondary"
                  small
                  onPress={() => undefined}
                />
              </View>
            </View>
          ))}
        </View>
      </SurfaceCard>
    </OperationsScreen>
  );
}

export function AssistantCargoScreen() {
  const router = useRouter();
  const { cargoMetrics, parcels, updateParcelStatus } = useOperations();

  return (
    <OperationsScreen
      title="Hàng ký gửi"
      subtitle="Toàn bộ flow parcel thuộc mặt bằng thao tác của phụ xe, tách khỏi Driver để giảm nhiễu."
    >
      <SurfaceCard accent delay={0}>
        <SectionTitle
          title="Tải trọng chuyến"
          subtitle="Tổng hợp nhanh số kiện, trọng lượng và các kiện cần xử lý ở stop tới."
        />

        <View style={styles.metricRow}>
          <MetricTile
            label="Đã nhận"
            value={String(cargoMetrics.loaded)}
            hint={`${cargoMetrics.total} kiện`}
            tone="success"
            compact
          />
          <MetricTile
            label="Chờ dỡ"
            value={String(cargoMetrics.unloadNext)}
            hint="điểm kế tiếp"
            tone="warning"
            compact
          />
          <MetricTile
            label="Tổng kg"
            value={`${cargoMetrics.totalWeight}kg`}
            hint="theo manifest"
            tone="info"
            compact
          />
        </View>
      </SurfaceCard>

      <SurfaceCard delay={120}>
        <SectionTitle
          title="Tác vụ của phụ xe"
          subtitle="Nút hành động đi theo đúng state machine parcel đã mô tả trong business rules."
        />

        <View style={styles.actionRow}>
          <ActionButton
            label="Ưu tiên kiện tại điểm tới"
            tone="primary"
            onPress={() => undefined}
          />
          <ActionButton
            label="Mở điểm dừng"
            tone="secondary"
            onPress={() => router.push("/assistant/stops")}
          />
        </View>
      </SurfaceCard>

      <SurfaceCard delay={180}>
        <SectionTitle
          title="Danh sách parcel"
          subtitle="Mỗi card bộc lộ rõ kiện đang ở đâu trong flow nhận lên xe, dỡ xuống và giao cho người nhận."
        />

        <View style={styles.listStack}>
          {parcels.map((parcel) => (
            <View key={parcel.id} style={styles.parcelCard}>
              <View style={styles.parcelHeader}>
                <View style={styles.parcelTitleStack}>
                  <Text style={styles.parcelCode}>{parcel.code}</Text>
                  <Text style={styles.parcelPeople}>
                    {parcel.senderName} → {parcel.recipientName}
                  </Text>
                </View>
                <StatusChip label={parcel.statusLabel} tone={parcel.tone} />
              </View>

              <View style={styles.metaStack}>
                <Text style={styles.metaText}>
                  Nhận tại: {parcel.pickupStopName}
                </Text>
                <Text style={styles.metaText}>
                  Giao tại: {parcel.dropoffStopName}
                </Text>
                <Text style={styles.metaText}>
                  Khối lượng: {parcel.weightKg}kg • Mã scan: {parcel.scanCode}
                </Text>
              </View>

              <View style={styles.actionRow}>
                <ActionButton
                  label={parcel.nextActionLabel}
                  tone="primary"
                  small
                  onPress={() => updateParcelStatus(parcel.id)}
                />
                <ActionButton
                  label="Xác nhận bằng QR"
                  tone="ghost"
                  small
                  onPress={() => undefined}
                />
              </View>
            </View>
          ))}
        </View>
      </SurfaceCard>
    </OperationsScreen>
  );
}

export function AssistantStopsScreen() {
  const {
    currentStop,
    currentStopArrived,
    markCurrentStopArrived,
    nextStop,
    pendingAtCurrentStopCount,
    routeStops,
    trip,
  } = useOperations();

  const stopActionLabel = currentStopArrived
    ? "Đã ghi nhận điểm dừng"
    : `Đã đến ${currentStop.shortName}`;

  return (
    <OperationsScreen
      title="Điểm dừng và ETA"
      subtitle="Phụ xe xác nhận ARRIVED, theo dõi điểm dừng kế tiếp và chuẩn bị boarding hoặc dỡ hàng tại bến."
    >
      <SurfaceCard accent delay={0}>
        <SectionTitle
          title={trip.routeName}
          subtitle={`${trip.tripCode} • ${trip.vehicleLabel}`}
        />

        <View style={styles.metricRow}>
          <MetricTile
            label="Điểm hiện tại"
            value={currentStop.name}
            hint={currentStop.zone}
            tone="warning"
            compact
          />
          <MetricTile
            label="Điểm kế tiếp"
            value={nextStop.name}
            hint={`ETA ${trip.nextStopEta}`}
            tone="primary"
            compact
          />
        </View>

        <View style={styles.metricRow}>
          <MetricTile
            label="Boarding pending"
            value={String(pendingAtCurrentStopCount)}
            hint="rà trước khi rời"
            tone={pendingAtCurrentStopCount > 0 ? "warning" : "success"}
            compact
          />
          <MetricTile
            label="Parcel chờ dỡ"
            value={String(trip.unloadAtNextStop)}
            hint="cần scan hoặc confirm"
            tone="info"
            compact
          />
        </View>
      </SurfaceCard>

      <RouteStopsCard routeStops={routeStops} />

      <SurfaceCard delay={180}>
        <SectionTitle
          title="Tác vụ tại điểm"
          subtitle="Nút ARRIVED chỉ nằm ở flow phụ xe để tránh trùng trách nhiệm với tài xế."
        />

        <View style={styles.actionRow}>
          <ActionButton
            label="Mở boarding"
            tone="secondary"
            onPress={() => undefined}
          />
          <ActionButton
            label={stopActionLabel}
            tone={currentStopArrived ? "ghost" : "primary"}
            onPress={markCurrentStopArrived}
          />
        </View>
      </SurfaceCard>
    </OperationsScreen>
  );
}

export function CrewSupportScreen() {
  const { notifications, role } = useOperations();
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "boot",
      speaker: "assistant",
      text: "Crew support đã sẵn sàng. Hỏi về boarding, incident, parcel hoặc quy trình khi đổi tuyến.",
    },
  ]);

  const sendMessage = (question: string) => {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
      return;
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: `${currentMessages.length + 1}-q`,
        speaker: "user",
        text: trimmedQuestion,
      },
      {
        id: `${currentMessages.length + 1}-a`,
        speaker: "assistant",
        text: buildAssistantReply(trimmedQuestion, role),
      },
    ]);
    setDraft("");
  };

  return (
    <OperationsScreen
      title="Hỗ trợ vận hành"
      subtitle="Chatbot RAG và feed thông báo điều hành vẫn được giữ chung, nhưng context trả lời đi theo role đã login."
    >
      <SurfaceCard accent delay={0}>
        <SectionTitle
          title="Crew AI"
          subtitle={`Đang trả lời theo context ${role}.`}
        />

        <View style={styles.promptWrap}>
          {SUPPORT_QUICK_PROMPTS.map((prompt) => (
            <ActionButton
              key={prompt}
              label={prompt}
              tone="secondary"
              small
              onPress={() => sendMessage(prompt)}
            />
          ))}
        </View>

        <View style={styles.chatStack}>
          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.messageBubble,
                message.speaker === "assistant"
                  ? styles.assistantBubble
                  : styles.userBubble,
              ]}
            >
              <Text style={styles.messageSpeaker}>
                {message.speaker === "assistant" ? "RAG" : "Bạn"}
              </Text>
              <Text style={styles.messageText}>{message.text}</Text>
            </View>
          ))}
        </View>

        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ví dụ: Nếu chuyến trễ hơn 30 phút tôi phải làm gì?"
          placeholderTextColor="#6D7A83"
          style={styles.input}
        />

        <ActionButton
          label="Gửi câu hỏi"
          tone="primary"
          onPress={() => sendMessage(draft)}
        />
      </SurfaceCard>

      <SurfaceCard delay={120}>
        <SectionTitle
          title="Thông báo điều hành"
          subtitle="Push quan trọng cho crew: route change, delayed trip, parcel cần xử lý, incident đã được operator tiếp nhận."
        />

        <View style={styles.notificationStack}>
          {notifications.map((notification) => (
            <View key={notification.id} style={styles.notificationCard}>
              <View style={styles.notificationHeader}>
                <Text style={styles.notificationTitle}>
                  {notification.title}
                </Text>
                <StatusChip
                  label={notification.badge}
                  tone={notification.tone}
                />
              </View>
              <Text style={styles.notificationBody}>{notification.body}</Text>
            </View>
          ))}
        </View>
      </SurfaceCard>
    </OperationsScreen>
  );
}

function AssignmentsSection({
  assignments,
  onPrimaryAction,
}: {
  assignments: ReturnType<typeof useOperations>["assignments"];
  onPrimaryAction: (index: number) => void;
}) {
  return (
    <SurfaceCard delay={240}>
      <SectionTitle
        title="Lịch làm việc"
        subtitle="Danh sách chuyến được phân công trong ngày, có gợi ý ưu tiên theo trách nhiệm của role hiện tại."
      />

      <View style={styles.assignmentStack}>
        {assignments.map((assignment, index) => (
          <View
            key={assignment.id}
            style={[
              styles.assignmentRow,
              index === assignments.length - 1 && styles.assignmentRowLast,
            ]}
          >
            <View style={styles.assignmentCopy}>
              <View style={styles.assignmentHeader}>
                <StatusChip
                  label={assignment.statusLabel}
                  tone={assignment.tone}
                />
                <StatusChip label={assignment.roleFocus} tone="neutral" />
              </View>
              <Text style={styles.assignmentTitle}>{assignment.routeName}</Text>
              <Text style={styles.assignmentHint}>{assignment.window}</Text>
              <Text style={styles.assignmentHint}>
                {assignment.vehicleLabel}
              </Text>
            </View>
            <ActionButton
              label={assignment.primaryAction}
              tone={index === 0 ? "primary" : "secondary"}
              small
              onPress={() => onPrimaryAction(index)}
            />
          </View>
        ))}
      </View>
    </SurfaceCard>
  );
}

function RouteStopsCard({
  routeStops,
}: {
  routeStops: ReturnType<typeof useOperations>["routeStops"];
}) {
  return (
    <SurfaceCard delay={120}>
      <SectionTitle
        title="Tiến trình tuyến"
        subtitle="Stop timeline được dùng chung nhưng mỗi role sẽ nhìn thấy nó trong ngữ cảnh riêng của mình."
      />

      <View style={styles.stopStack}>
        {routeStops.map((stop) => (
          <View key={stop.id} style={styles.stopRow}>
            <View style={styles.stopMarkerColumn}>
              <View
                style={[
                  styles.stopMarker,
                  stop.stage === "COMPLETED" && styles.stopMarkerCompleted,
                  stop.stage === "CURRENT" && styles.stopMarkerCurrent,
                ]}
              />
              <View
                style={
                  stop.stage === "UPCOMING"
                    ? styles.stopLine
                    : styles.stopLineActive
                }
              />
            </View>

            <View style={styles.stopContent}>
              <View style={styles.stopHeader}>
                <View style={styles.stopNameBlock}>
                  <Text style={styles.stopTitle}>{stop.name}</Text>
                  <Text style={styles.stopSubtitle}>{stop.zone}</Text>
                </View>
                <StatusChip label={stop.statusLabel} tone={stop.tone} />
              </View>
              <Text style={styles.stopMeta}>{stop.timeLabel}</Text>
              {stop.note ? (
                <Text style={styles.stopNote}>{stop.note}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  metricRow: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  metricRowBoarding: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  assignmentStack: {
    gap: Spacing.three,
  },
  assignmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148, 163, 174, 0.12)",
  },
  assignmentRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  assignmentCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  assignmentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  assignmentTitle: {
    color: "#F4F7F8",
    fontFamily: Fonts.rounded,
    fontSize: 17,
    fontWeight: 700,
  },
  assignmentHint: {
    color: "#94A3AE",
    fontSize: 13,
  },
  stopStack: {
    gap: Spacing.two,
  },
  stopRow: {
    flexDirection: "row",
    gap: Spacing.three,
  },
  stopMarkerColumn: {
    alignItems: "center",
    width: 18,
  },
  stopMarker: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: "#2C3942",
    borderWidth: 2,
    borderColor: "#94A3AE",
    marginTop: 5,
  },
  stopMarkerCompleted: {
    backgroundColor: "#00E676",
    borderColor: "#00E676",
  },
  stopMarkerCurrent: {
    backgroundColor: "#FFD600",
    borderColor: "#FFD600",
  },
  stopLine: {
    flex: 1,
    width: 2,
    backgroundColor: "rgba(148, 163, 174, 0.15)",
    marginTop: Spacing.one,
  },
  stopLineActive: {
    flex: 1,
    width: 2,
    backgroundColor: "rgba(2, 195, 154, 0.3)",
    marginTop: Spacing.one,
  },
  stopContent: {
    flex: 1,
    gap: Spacing.one,
    paddingBottom: Spacing.three,
  },
  stopHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  stopNameBlock: {
    flex: 1,
    gap: 2,
  },
  stopTitle: {
    color: "#F4F7F8",
    fontFamily: Fonts.rounded,
    fontSize: 17,
    fontWeight: 700,
  },
  stopSubtitle: {
    color: "#94A3AE",
    fontSize: 13,
  },
  stopMeta: {
    color: "#D3DBDF",
    fontSize: 14,
  },
  stopNote: {
    color: "#94A3AE",
    fontSize: 13,
  },
  categoryWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  input: {
    minHeight: 116,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#2C3942",
    backgroundColor: "#151B20",
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    color: "#F4F7F8",
    textAlignVertical: "top",
    fontSize: 15,
    lineHeight: 22,
  },
  feedbackBanner: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 82, 82, 0.24)",
    backgroundColor: "rgba(255, 82, 82, 0.08)",
    padding: Spacing.three,
    gap: Spacing.two,
  },
  feedbackText: {
    color: "#F4F7F8",
    fontSize: 14,
    lineHeight: 21,
  },
  warningText: {
    color: "#D3DBDF",
    fontSize: 14,
    lineHeight: 22,
  },
  listStack: {
    gap: Spacing.three,
  },
  passengerCard: {
    borderRadius: 22,
    padding: Spacing.three,
    backgroundColor: "#151B20",
    borderWidth: 1,
    borderColor: "#2C3942",
    gap: Spacing.two,
  },
  passengerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
    alignItems: "flex-start",
  },
  passengerHead: {
    flex: 1,
    gap: 4,
  },
  bookingCode: {
    color: "#02C39A",
    fontFamily: Fonts.mono,
    fontSize: 13,
  },
  passengerName: {
    color: "#F4F7F8",
    fontFamily: Fonts.rounded,
    fontSize: 18,
    fontWeight: 700,
  },
  passengerMetaWrap: {
    gap: 4,
  },
  metaText: {
    color: "#B6C1C8",
    fontSize: 14,
    lineHeight: 20,
  },
  parcelCard: {
    borderRadius: 22,
    padding: Spacing.three,
    backgroundColor: "#151B20",
    borderWidth: 1,
    borderColor: "#2C3942",
    gap: Spacing.two,
  },
  parcelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
    alignItems: "flex-start",
  },
  parcelTitleStack: {
    flex: 1,
    gap: 4,
  },
  parcelCode: {
    color: "#02C39A",
    fontFamily: Fonts.mono,
    fontSize: 13,
  },
  parcelPeople: {
    color: "#F4F7F8",
    fontFamily: Fonts.rounded,
    fontSize: 17,
    fontWeight: 700,
  },
  metaStack: {
    gap: 4,
  },
  promptWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
  },
  chatStack: {
    gap: Spacing.two,
  },
  messageBubble: {
    borderRadius: 22,
    padding: Spacing.three,
    gap: Spacing.one,
    maxWidth: "92%",
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#151B20",
    borderWidth: 1,
    borderColor: "#2C3942",
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#113F3A",
    borderWidth: 1,
    borderColor: "rgba(2, 195, 154, 0.25)",
  },
  messageSpeaker: {
    color: "#94A3AE",
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
  messageText: {
    color: "#F4F7F8",
    fontSize: 15,
    lineHeight: 22,
  },
  notificationStack: {
    gap: Spacing.three,
  },
  notificationCard: {
    borderRadius: 22,
    padding: Spacing.three,
    backgroundColor: "#151B20",
    borderWidth: 1,
    borderColor: "#2C3942",
    gap: Spacing.two,
  },
  notificationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
    alignItems: "flex-start",
  },
  notificationTitle: {
    flex: 1,
    color: "#F4F7F8",
    fontFamily: Fonts.rounded,
    fontSize: 17,
    fontWeight: 700,
  },
  notificationBody: {
    color: "#B6C1C8",
    fontSize: 14,
    lineHeight: 21,
  },
});
