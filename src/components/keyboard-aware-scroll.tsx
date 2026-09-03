import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type KeyboardEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Spacing } from "@/constants/theme";

// Khung "ScrollView cuộn dọc có ô nhập" đã xử lý bàn phím, dùng chung cho mọi
// màn có TextInput.
//
// Vì sao phải tự làm thay vì tin vào hệ điều hành: Android edge-to-edge (mặc
// định từ Expo SDK 56) KHÔNG còn co cửa sổ theo bàn phím nữa — `adjustResize`
// vô hiệu, bàn phím vẽ phủ đè lên ScrollView. Không bù gì thì ô nhập cuối form
// và nút Gửi nằm dưới bàn phím, người dùng không thấy mình đang gõ vào đâu, gõ
// xong cũng không bấm được nút.
//
// Logic này trước đây chỉ nằm trong OperationsScreen, nên các màn ngoài nó
// (đăng nhập, quên mật khẩu, thiết lập mật khẩu) không được che chắn gì. Tách
// thành component thay vì hook để toàn bộ ref/đo đạc nằm gọn bên trong — màn
// dùng chỉ cần bọc nội dung vào đây.

// Ô nhập có nút bấm ngay bên dưới (ghi chú + nút Duyệt trong cùng card) thì
// "ô vừa nổi lên trên bàn phím" là chưa đủ: gõ xong người dùng vẫn không thấy
// nút để bấm. Màn dùng gọi `useKeepInputVisible()` rồi đặt chỗ trước cho phần
// nằm dưới ô nhập khi ô đó được focus.
const KeepInputVisibleContext = createContext<((px: number) => void) | null>(
  null,
);

function noop() {}

// Ngoài KeyboardAwareScroll thì trả no-op để màn dùng không phải kiểm tra null.
export function useKeepInputVisible(): (px: number) => void {
  return useContext(KeepInputVisibleContext) ?? noop;
}

export function KeyboardAwareScroll({
  background,
  children,
  contentContainerStyle,
  extraBottomPadding = Spacing.four,
  foreground,
  paddingTop,
  refreshControl,
  scrollStyle,
  style,
}: PropsWithChildren<{
  // Lớp trang trí vẽ DƯỚI ScrollView (các quầng sáng nền).
  background?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  // Khoảng đệm cộng thêm dưới safe-area đáy / chiều cao bàn phím.
  extraBottomPadding?: number;
  // Lớp vẽ ĐÈ LÊN ScrollView (dải che thanh trạng thái).
  foreground?: ReactNode;
  paddingTop: number;
  refreshControl?: ScrollViewProps["refreshControl"];
  scrollStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}>) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const rootRef = useRef<View>(null);
  const keyboardOpen = useRef(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Vị trí cuộn hiện tại + mép trên bàn phím, giữ trong ref để tính toán mà
  // không kích hoạt render lại giữa lúc đang gõ.
  const scrollY = useRef(0);
  const keyboardTop = useRef(Number.POSITIVE_INFINITY);
  // Chiều cao phần cần thấy thêm bên dưới ô đang gõ (hàng nút Duyệt/Từ chối…).
  // Giữ trong ref vì keepInputVisible đọc lại nó trong nhịp trễ, kể cả khi
  // bàn phím mở sau lúc focus.
  const reservedBelow = useRef(0);

  // Giữ ô ĐANG GÕ nằm trên bàn phím.
  //
  // Không dùng `scrollToEnd()` với giả định "form nào cũng nằm cuối màn": giả
  // định đó sai ở màn Hàng hoá (panel cân/đo nằm trong card giữa danh sách),
  // gõ một chữ là màn nhảy xuống tận cuối danh sách. Thay vào đó đo đúng ô
  // đang focus rồi chỉ cuộn vừa đủ để nó nổi trên bàn phím.
  // fallbackToEnd: chỉ bật ở nhịp bàn phím vừa mở. Không xác định được ô đang
  // gõ mà vẫn cuộn xuống cuối trong mọi tình huống thì mỗi cú chạm làm mất focus
  // sẽ kéo màn nhảy xuống đáy — đúng cảm giác "màn tự nhảy" phải tránh.
  const keepInputVisible = useCallback((fallbackToEnd = false) => {
    // Chỉ cuộn khi bàn phím đang mở (bàn phím mở ⇒ đang gõ ở đâu đó), tránh
    // giật màn khi nội dung đổi vì lý do khác — query trả về, card mở rộng…
    if (!keyboardOpen.current) {
      return;
    }

    // Hai nhịp: gõ xong layout chưa kịp co theo bàn phím, nhịp 300ms bù lại.
    const nudge = () => {
      // Đọc ô đang focus TRONG nhịp trễ, không đọc trước: khi hàm này được gọi
      // từ lúc người dùng vừa chạm sang ô khác, focus còn chưa chuyển — đọc
      // sớm là đo đúng ô cũ rồi kết luận "không cần cuộn".
      const focused = TextInput.State.currentlyFocusedInput();
      if (!focused) {
        // Không xác định được ô nào đang gõ (bàn phím của WebView, ô ngoài
        // ScrollView…) → cuộn xuống cuối cho chắc.
        if (fallbackToEnd) {
          scrollRef.current?.scrollToEnd({ animated: false });
        }
        return;
      }

      focused.measureInWindow((_x, y, _width, height) => {
        // Chừa một khoảng thở dưới ô để còn thấy được viền và dòng gợi ý.
        const margin = Spacing.four + reservedBelow.current;
        const overlap = y + height + margin - keyboardTop.current;
        if (overlap <= 0) {
          // Ô đã nằm trên bàn phím rồi thì ĐỪNG cuộn — cuộn thừa chính là cảm
          // giác "màn tự nhảy" mà người dùng thấy.
          return;
        }
        scrollRef.current?.scrollTo({
          y: scrollY.current + overlap,
          animated: false,
        });
      });
    };
    setTimeout(nudge, 50);
    setTimeout(nudge, 300);
  }, []);

  // Ô nhập gọi hàm này lúc focus (đặt chỗ) và lúc blur (trả về 0).
  const reserveBelowInput = useCallback(
    (px: number) => {
      reservedBelow.current = Math.max(0, px);
      keepInputVisible();
    },
    [keepInputVisible],
  );

  useEffect(() => {
    const onKeyboardFrame = (event: KeyboardEvent) => {
      keyboardOpen.current = true;

      // Bàn phím đo từ ĐÁY MÀN HÌNH, còn ScrollView có thể kết thúc ở phía
      // trên (tab bar) → lấy nguyên endCoordinates.height là dư đúng chiều cao
      // tab bar. Đo vị trí đáy thật của màn rồi chỉ bù phần thực sự bị chồng.
      rootRef.current?.measureInWindow((_x, y, _width, height) => {
        // "screen" chứ không phải "window": ở chế độ edge-to-edge, window
        // height đã trừ mất thanh điều hướng nên keyboardTop bị tính thấp đi,
        // padding thiếu đúng chiều cao thanh đó và nút Gửi vẫn bị cắt một nửa.
        // measureInWindow có lúc trả y âm (đo ngay trong lúc layout còn dịch
        // chuyển) → kẹp về 0, không thì padding thiếu đúng phần âm đó.
        const screenHeight = Dimensions.get("screen").height;
        const top = screenHeight - event.endCoordinates.height;
        keyboardTop.current = top;
        const bottom = Math.max(0, y) + height;
        setKeyboardHeight(Math.max(0, bottom - top));
        keepInputVisible(true);
      });
    };

    const show = Keyboard.addListener("keyboardDidShow", onKeyboardFrame);
    // Bàn phím ĐỔI CHIỀU CAO mà không đóng: nhảy từ ô số (decimal-pad, bàn phím
    // thấp) sang ô ghi chú (QWERTY, cao hơn) trong cùng card kiện hàng là đúng
    // trường hợp này — padding còn tính theo bàn phím cũ nên ô ghi chú bị che.
    // Sự kiện này không có trên mọi nền tảng nên chỉ là lớp bù thêm.
    const changeFrame = Keyboard.addListener(
      "keyboardDidChangeFrame",
      onKeyboardFrame,
    );
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardOpen.current = false;
      keyboardTop.current = Number.POSITIVE_INFINITY;
      setKeyboardHeight(0);
    });

    return () => {
      show.remove();
      changeFrame.remove();
      hide.remove();
    };
  }, [keepInputVisible]);

  return (
    <KeepInputVisibleContext.Provider value={reserveBelowInput}>
      <KeyboardAvoidingView
        // iOS không tự co layout khi bàn phím hiện → phải đệm bằng padding.
        // Android đã có windowSoftInputMode=adjustResize nên để undefined, thêm
        // behavior vào là bị đẩy hai lần.
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.fill, style]}
      >
        {/* View đo đạc: KeyboardAvoidingView không cho gắn ref kiểu View nên đo
          trên lớp bọc bên trong (cùng kích thước). */}
        <View
          ref={rootRef}
          collapsable={false}
          style={styles.fill}
          // Bàn phím ĐANG MỞ mà người dùng chạm sang một ô khác thì sự kiện
          // keyboardDidShow KHÔNG phát lại → không ai cuộn, ô vừa chạm nằm dưới
          // bàn phím. Đây là ca hay gặp ở card kiện hàng: gõ số cân xong chạm
          // xuống ô ghi chú. Nghe ở lớp bọc để mọi cú chạm đều kiểm tra lại; hàm
          // này tự thoát nếu bàn phím đóng hoặc ô đã nằm trên bàn phím nên không
          // gây cuộn thừa. Trả false để không giành responder của con.
          onStartShouldSetResponderCapture={() => {
            keepInputVisible();
            return false;
          }}
        >
          {background}

          <ScrollView
            ref={scrollRef}
            style={scrollStyle}
            // Ô mô tả là multiline, gõ dài thì nó cao dần xuống dưới và chui vào
            // vùng bàn phím → mỗi lần nội dung cao lên thì cuộn theo.
            onContentSizeChange={() => keepInputVisible()}
            // Cần vị trí cuộn thật để tính "cuộn thêm bao nhiêu là vừa đủ".
            onScroll={(event) => {
              scrollY.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            // Bàn phím: tự chừa chỗ để ô nhập/nút bấm cuối form không bị che, và
            // cho phép chạm thẳng vào nút khi bàn phím đang mở (mặc định phải
            // chạm 2 lần — lần đầu chỉ để đóng bàn phím, và đó chính là lúc người
            // dùng tưởng nút bị lỗi rồi bấm lại).
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={refreshControl}
            contentContainerStyle={[
              contentContainerStyle,
              {
                paddingTop,
                // Bàn phím mở thì chính nó đã phủ lên thanh điều hướng → cộng
                // thêm safe-area đáy nữa là thừa ra một mảng trống.
                paddingBottom:
                  (keyboardHeight > 0 ? keyboardHeight : insets.bottom) +
                  extraBottomPadding,
              },
            ]}
          >
            {children}
          </ScrollView>

          {foreground}
        </View>
      </KeyboardAvoidingView>
    </KeepInputVisibleContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
