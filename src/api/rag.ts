import { fetch } from "expo/fetch";

import { API_BASE_URL, ApiError } from "./client";
import { getTokens } from "./token-storage";
import type { Envelope } from "./types";

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

  const response = await fetch(`${API_BASE_URL}/api/v1/rag/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
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
    let message = "Trợ lý ảo đang gián đoạn, thử lại sau.";
    let code = "RAG_UNAVAILABLE";
    try {
      const envelope = (await response.json()) as Envelope<unknown>;
      message = envelope.error?.message ?? message;
      code = envelope.error?.code ?? code;
    } catch {
      // Body không phải JSON — giữ message mặc định.
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
      throw new ApiError({
        code: "RAG_STREAM_ERROR",
        message: extractTokenText(data) || "Trợ lý ảo gặp lỗi khi trả lời.",
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
