// Setup chung cho toàn bộ test. Giữ tối thiểu: chỉ mock những module native
// mà jest-expo không tự lo, thêm dần khi có test mới cần.
// RNTL v14 đã gắn sẵn matcher (toBeOnTheScreen…) khi import, không cần
// extend-expect như bản cũ.

// Haptics gọi xuống native, trong test chỉ cần no-op để không nổ.
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

// `unknownEnum` trong parcel-format chỉ log khi __DEV__. Test enum cố tình
// truyền giá trị lạ nên console sẽ ồn — tắt warn mặc định, test nào cần kiểm
// tra log thì tự spy lại.
beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});
