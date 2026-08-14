import { ApiError, apiErrorDisplayMessage } from "@/api/client";

// Thông báo tiếng Việt cho mã lỗi của trợ lý ảo (docs/Implements/API-RAG.md).
// streamRagChat chỉ giữ `code` của backend và thay message tiếng Anh bằng câu
// mặc định, nên bảng này là chỗ duy nhất diễn giải lý do cụ thể cho crew.
// Mã chưa map rơi về câu chung tiếng Việt của apiErrorDisplayMessage.
const MESSAGES: Record<string, string> = {
  // Quá tải / giới hạn — chờ rồi hỏi lại là được.
  RAG_RATE_LIMIT_EXCEEDED: "Bạn hỏi hơi nhanh. Đợi một chút rồi hỏi lại nhé.",
  RAG_PROVIDER_RATE_LIMITED:
    "Trợ lý đang quá tải. Đợi một chút rồi hỏi lại nhé.",
  // Nhà cung cấp mô hình / dịch vụ phụ thuộc gián đoạn.
  RAG_PROVIDER_UNAVAILABLE: "Trợ lý ảo đang gián đoạn, thử lại sau ít phút.",
  RAG_PROVIDER_CIRCUIT_OPEN:
    "Trợ lý ảo đang tạm ngưng do lỗi liên tiếp, thử lại sau ít phút.",
  RAG_PROVIDER_INVALID_RESPONSE:
    "Trợ lý trả lời không hợp lệ. Hỏi lại giúp em.",
  RAG_DEPENDENCY_UNAVAILABLE: "Trợ lý ảo đang gián đoạn, thử lại sau ít phút.",
  RAG_STORAGE_UNAVAILABLE:
    "Chưa đọc được kho tài liệu của nhà xe, thử lại sau ít phút.",
  RAG_STORAGE_CONFIG_UNAVAILABLE:
    "Kho tài liệu của nhà xe chưa được cấu hình. Báo điều hành giúp em.",
  RAG_STORAGE_INVALID_RESPONSE:
    "Kho tài liệu trả dữ liệu không hợp lệ. Báo điều hành giúp em.",
  RAG_EMBEDDING_DIMENSION_MISMATCH:
    "Dữ liệu tài liệu của nhà xe đang lỗi. Báo điều hành giúp em.",
  // Câu hỏi không hợp lệ.
  RAG_MESSAGE_TOO_LONG: "Câu hỏi quá dài. Rút ngắn rồi gửi lại giúp em.",
  RAG_MAX_MESSAGE_CHARS: "Câu hỏi quá dài. Rút ngắn rồi gửi lại giúp em.",
  // Hội thoại / quyền.
  RAG_CONVERSATION_NOT_FOUND:
    "Cuộc trò chuyện này không còn nữa. Bắt đầu hỏi lại từ đầu giúp em.",
  RAG_CONVERSATION_FORBIDDEN: "Bạn không xem được cuộc trò chuyện này.",
  RAG_CONVERSATION_SCOPE_MISMATCH:
    "Cuộc trò chuyện này không thuộc nhà xe của bạn.",
  RAG_MESSAGE_NOT_FOUND: "Không tìm thấy câu trả lời để đánh giá.",
  RAG_FEEDBACK_FORBIDDEN: "Bạn không đánh giá được câu trả lời này.",
  RAG_FEEDBACK_ASSISTANT_ONLY:
    "Chỉ đánh giá được câu trả lời của trợ lý, không đánh giá câu hỏi.",
  RAG_OPERATOR_SCOPE_REQUIRED:
    "Tài khoản chưa gắn với nhà xe nào nên chưa dùng được trợ lý.",
  RAG_OPERATOR_SCOPE_FORBIDDEN:
    "Tài khoản không có quyền hỏi trợ lý của nhà xe này.",
  RAG_ADMIN_REQUIRED: "Chức năng này chỉ dành cho quản trị viên.",
};

// Đổi lỗi của luồng trợ lý ảo thành câu tiếng Việt hiển thị được.
export function ragErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return MESSAGES[error.code] ?? apiErrorDisplayMessage(error);
  }
  return "Trợ lý ảo đang gián đoạn, thử lại sau.";
}
