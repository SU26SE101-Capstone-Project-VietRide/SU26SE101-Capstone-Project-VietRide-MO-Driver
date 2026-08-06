// Giải mã Google encoded polyline (precision 5) thành danh sách toạ độ.
// Backend trả pathPolyline ở dạng mã hoá, khác với endpoint tracking (đã giải mã
// sẵn), nên chỗ này app phải tự làm.
//
// Khai type riêng thay vì import GeoPoint từ @/api/types để file không phụ thuộc
// gì cả — nhờ vậy chạy thẳng được bằng node --experimental-strip-types khi kiểm
// chứng. Cấu trúc giống hệt GeoPoint nên gán qua lại vẫn hợp lệ.
export type PolylinePoint = { latitude: number; longitude: number };

type Chunk = { value: number; nextIndex: number };

// Đọc một số nguyên đã mã hoá bắt đầu từ vị trí start.
// Trả null khi chuỗi hỏng hoặc hết giữa chừng — người gọi dừng lại, giữ phần
// đã giải mã được thay vì ném lỗi làm sập màn hình.
function readChunk(encoded: string, start: number): Chunk | null {
  let result = 0;
  let shift = 0;
  let index = start;

  while (index < encoded.length) {
    const byte = encoded.charCodeAt(index) - 63;
    index += 1;

    // Ký tự ngoài bảng mã (byte < 0) nghĩa là chuỗi không phải polyline hợp lệ.
    if (byte < 0) {
      return null;
    }

    result |= (byte & 0x1f) << shift;

    // Byte không bật bit 0x20 là byte cuối của số này.
    if (byte < 0x20) {
      // Bit dấu nằm ở LSB: lẻ = số âm.
      const value = result & 1 ? ~(result >> 1) : result >> 1;
      return { value, nextIndex: index };
    }

    shift += 5;

    // Một toạ độ hợp lệ không bao giờ cần quá 6 byte; vượt mức này là chuỗi rác,
    // chặn sớm để khỏi tràn số nguyên 32 bit.
    if (shift > 30) {
      return null;
    }
  }

  return null;
}

export function decodePolyline(encoded: string): PolylinePoint[] {
  const points: PolylinePoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    const latChunk = readChunk(encoded, index);
    if (!latChunk) {
      return points;
    }

    const lngChunk = readChunk(encoded, latChunk.nextIndex);
    if (!lngChunk) {
      return points;
    }

    // Giá trị mã hoá là delta so với điểm trước, không phải toạ độ tuyệt đối.
    lat += latChunk.value;
    lng += lngChunk.value;
    index = lngChunk.nextIndex;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}
