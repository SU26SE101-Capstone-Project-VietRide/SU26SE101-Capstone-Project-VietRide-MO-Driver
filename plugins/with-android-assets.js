const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Copy mọi file trong assets/native/ vào android/app/src/main/assets khi
// prebuild — hiện dùng cho model 3D của puck xe trên màn dẫn đường (Mapbox
// đọc qua uri "asset://<tên file>"). KHÔNG sửa tay thư mục android/ — muốn
// thêm asset native thì bỏ file vào assets/native/ rồi prebuild lại.
module.exports = function withAndroidNativeAssets(config) {
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const src = path.join(cfg.modRequest.projectRoot, "assets", "native");
      const dest = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "assets",
      );
      if (fs.existsSync(src)) {
        fs.mkdirSync(dest, { recursive: true });
        for (const file of fs.readdirSync(src)) {
          fs.copyFileSync(path.join(src, file), path.join(dest, file));
        }
      }
      return cfg;
    },
  ]);
};
