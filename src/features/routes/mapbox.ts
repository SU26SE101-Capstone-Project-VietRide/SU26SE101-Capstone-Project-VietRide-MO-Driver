import Mapbox from "@rnmapbox/maps";

// Init token Mapbox đúng 1 lần cho cả app. Token pk. là public identifier
// (giới hạn theo scope style/tiles), đặt trong .env để không hard-code.
void Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "");

export default Mapbox;
