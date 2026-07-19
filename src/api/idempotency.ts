// Sinh Idempotency-Key duy nhất cho các mutation yêu cầu header này (Parcel service).
// Middleware Redis của backend: cùng key + cùng body → replay kết quả cũ (TTL 24h);
// cùng key + khác body → 422 IDEMPOTENCY_KEY_MISMATCH. Mỗi thao tác người dùng nên
// dùng 1 key mới; nếu cần retry an toàn thì tái dùng cùng key cho lần thử lại.

type MaybeCrypto = { randomUUID?: () => string };

export function newIdempotencyKey(): string {
  // Ưu tiên crypto.randomUUID nếu runtime có (Hermes mới / web).
  const cryptoObj = (globalThis as { crypto?: MaybeCrypto }).crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }

  // Fallback UUID v4 — đủ ngẫu nhiên để làm khóa idempotency phía client.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
