import { fetch } from "expo/fetch";

import { apiRequest, API_BASE_URL, ApiError } from "./client";
import { newIdempotencyKey } from "./idempotency";
import { getTokens } from "./token-storage";
import type { Envelope, RagFeedbackData, RagRating } from "./types";

// Đánh giá 1 câu trả lời của trợ lý (assistantMessageId lấy từ event done).
export function sendRagFeedback(
  messageId: string,
  rating: RagRating,
): Promise<RagFeedbackData> {
  return apiRequest<RagFeedbackData>(
    `/v1/rag/messages/${messageId}/feedback`,
    { method: "POST", body: { rating } },
  );
}

export type RagChatParams = {
  message: string;
  conversationId?: string | null;
  onToken: (text: string) => void;
  // done có thể kèm payload (vd conversationId) — parse defensive.
  onDone?: (payload: Record<string, unknown> | null) => void;
  signal?: AbortSignal;
};

// Lấy phần text từ data của event token — backend có thể trả string thô
// hoặc JSON { delta | text | content | token }.
function extractTokenText(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed === "string") {
      return parsed;
    }

    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      for (const key of ["delta", "text", "content", "token"]) {
        if (typeof record[key] === "string") {
          return record[key] as string;
        }
      }
      return "";
    }
  } catch {
    // Không phải JSON → dùng nguyên văn.
  }
  return raw;
}

// Event error mang { code, message } theo doc — trích ra để giữ nguyên lỗi backend.
function parseErrorPayload(raw: string): { code?: string; message?: string } {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      return {
        code: typeof record.code === "string" ? record.code : undefined,
        message: typeof record.message === "string" ? record.message : undefined,
      };
    }
  } catch {
    // Không phải JSON — coi nguyên văn là message.
    return { message: raw || undefined };
  }
  return {};
}

function parseDonePayload(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // done không có payload JSON — bỏ qua.
  }
  return null;
}

export async function streamRagChat(params: RagChatParams): Promise<void> {
  const tokens = await getTokens();

  const response = await fetch(`${API_BASE_URL}/v1/rag/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      // BE yêu cầu Idempotency-Key cho /rag/chat (kiểm chứng production
      // 2026-07-26: thiếu → 422 IDEMPOTENCY_KEY_REQUIRED), dù API-RAG.md chưa
      // ghi. Mỗi câu hỏi là request mới nên sinh key mới mỗi lần gọi.
      "Idempotency-Key": newIdempotencyKey(),
      ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    },
    body: JSON.stringify({
      message: params.message,
      ...(params.conversationId
        ? { conversationId: params.conversationId }
        : {}),
    }),
    signal: params.signal,
  });

  if (!response.ok || !response.body) {
    const message = "Trợ lý ảo đang gián đoạn, thử lại sau.";
    let code = "RAG_UNAVAILABLE";
    try {
      const envelope = (await response.json()) as Envelope<unknown>;
      // Chỉ lấy code; message backend là tiếng Anh, giữ câu tiếng Việt mặc định.
      code = envelope.error?.code ?? code;
    } catch {
      // Body không phải JSON — giữ code mặc định.
    }
    throw new ApiError({ code, message, statusCode: response.status });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Đọc từng SSE frame (ngăn cách bằng dòng trống), gom các dòng data: theo event:.
  const handleFrame = (frame: string) => {
    let eventName = "message";
    const dataLines: string[] = [];

    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    const data = dataLines.join("\n");

    if (eventName === "token" || eventName === "message") {
      const text = extractTokenText(data);
      if (text) {
        params.onToken(text);
      }
    } else if (eventName === "done") {
      params.onDone?.(parseDonePayload(data));
    } else if (eventName === "error") {
      const err = parseErrorPayload(data);
      // Bỏ err.message (tiếng Anh) — chỉ giữ code để debug qua log.
      throw new ApiError({
        code: err.code ?? "RAG_STREAM_ERROR",
        message: "Trợ lý ảo gặp lỗi khi trả lời.",
        statusCode: 200,
      });
    }
  };

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const frame = buffer.slice(0, separatorIndex).replace(/\r/g, "");
      buffer = buffer.slice(separatorIndex + 2);
      handleFrame(frame);
      separatorIndex = buffer.indexOf("\n\n");
    }
  }
}
