import { supportQuickPromptsSeed } from "./mock-data";

// File này từng chứa OperationsProvider mock cho cargo/stops/incident thời chưa
// có API thật. Toàn bộ màn hình đã chuyển sang React Query gọi API thật
// (src/features/parcels, trip-ops, trips…) nên provider đã được xoá
// (2026-08-08). Chỉ còn giữ bộ câu hỏi gợi ý cho màn Hỗ trợ.
export const SUPPORT_QUICK_PROMPTS = supportQuickPromptsSeed;
