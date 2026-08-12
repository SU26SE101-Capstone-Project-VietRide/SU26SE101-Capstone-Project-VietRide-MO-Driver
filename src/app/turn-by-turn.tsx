// Export thẳng (KHÔNG dùng React.lazy): chunk lazy của Metro nhân đôi các
// module dùng chung (selected-trip-context...) làm context trong chunk khác
// instance với Provider ở bundle chính → useSelectedTrip vỡ. Native module
// ExpoMapboxNavigation đã có trong dev client nên import tĩnh an toàn.
export { TurnByTurnScreen as default } from "@/features/routes/turn-by-turn-screen";
