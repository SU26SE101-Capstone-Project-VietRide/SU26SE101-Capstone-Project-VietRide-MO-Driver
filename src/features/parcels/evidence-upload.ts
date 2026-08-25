import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  initializeAuth,
  inMemoryPersistence,
  signInWithCustomToken,
  type Auth,
} from "firebase/auth";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

import { getFirebaseCustomToken } from "@/api/auth";

// Upload ảnh bằng chứng nhận/giao kiện lên Firebase Storage
// (docs/Implements/API-Parcel-QR-Crew.md). Luồng: đổi JWT app lấy custom token
// purpose PARCEL_EVIDENCE_PHOTO → đăng nhập Firebase Auth → upload vào
// parcel-ops/{operatorId}/{userId}/{parcelId}/{fileName} → gửi URL kèm
// check-in/deliver. Storage Rules CHỈ cho role ASSISTANT ghi.

// Giới hạn theo Storage Rules + validator backend.
export const MAX_EVIDENCE_PHOTOS = 3;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// Config web SDK đọc từ .env (gitignored, giống google-services.json).
// apiKey Firebase là public identifier, không phải secret.
function firebaseConfig() {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !projectId || !storageBucket || !appId) {
    throw new Error(
      "Thiếu cấu hình Firebase (EXPO_PUBLIC_FIREBASE_*) trong .env — không upload được ảnh.",
    );
  }

  return { apiKey, projectId, storageBucket, appId };
}

// Khởi tạo lười, dùng chung 1 app/auth cho cả phiên. Persistence in-memory là
// đủ: mỗi lần upload đều xin custom token mới, không cần nhớ phiên Firebase.
let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

function ensureFirebase(): { app: FirebaseApp; auth: Auth } {
  if (!firebaseApp) {
    firebaseApp = getApps()[0] ?? initializeApp(firebaseConfig());
    firebaseAuth = initializeAuth(firebaseApp, {
      persistence: inMemoryPersistence,
    });
  }
  return { app: firebaseApp, auth: firebaseAuth as Auth };
}

// Upload danh sách ảnh (uri cục bộ từ camera) cho 1 kiện. Trả về mảng URL để
// gửi trong body check-in/deliver. Throw Error với message tiếng Việt khi
// thiếu quyền/quá cỡ — caller hiển thị nguyên văn.
export async function uploadEvidencePhotos(
  parcelId: string,
  // "custody": ảnh hiện trường kèm báo sự cố custody (API-Parcel-Driver §8.1).
  kind: "check-in" | "delivery" | "custody",
  localUris: string[],
): Promise<string[]> {
  if (localUris.length === 0) {
    return [];
  }
  if (localUris.length > MAX_EVIDENCE_PHOTOS) {
    throw new Error(`Tối đa ${MAX_EVIDENCE_PHOTOS} ảnh cho mỗi bước.`);
  }

  const grant = await getFirebaseCustomToken("PARCEL_EVIDENCE_PHOTO");
  if (!grant.token || !grant.uploadPath) {
    throw new Error("Không lấy được quyền upload ảnh. Thử lại sau.");
  }

  const { app, auth } = ensureFirebase();
  await signInWithCustomToken(auth, grant.token);

  const storage = getStorage(app);
  const prefix = grant.uploadPath.endsWith("/")
    ? grant.uploadPath
    : `${grant.uploadPath}/`;

  const urls: string[] = [];
  for (let index = 0; index < localUris.length; index += 1) {
    // fetch đọc được file:// cục bộ trên native → Blob cho uploadBytes.
    const response = await fetch(localUris[index]);
    const blob = await response.blob();

    if (blob.size <= 0 || blob.size >= MAX_PHOTO_BYTES) {
      throw new Error(`Ảnh thứ ${index + 1} vượt quá 5MB. Chụp lại giúp nhé.`);
    }

    const path = `${prefix}${parcelId}/${kind}-${index + 1}-${Date.now()}.jpg`;
    const objectRef = ref(storage, path);
    await uploadBytes(objectRef, blob, { contentType: "image/jpeg" });
    // LƯU Ý: backend validate URL thuộc đúng bucket + path khớp operator/
    // assistant/parcel. getDownloadURL trả dạng firebasestorage.googleapis.com
    // (kèm token đọc) — nếu validator BE chỉ nhận dạng
    // storage.googleapis.com/{bucket}/{path} thì đổi sang tự dựng URL ở đây.
    urls.push(await getDownloadURL(objectRef));
  }

  return urls;
}
