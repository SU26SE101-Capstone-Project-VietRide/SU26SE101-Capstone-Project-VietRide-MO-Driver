// Dynamic config: bơm secret/token từ .env vào app.json để không hard-code trong repo.
// Expo CLI tự load .env trước khi chạy file này.
module.exports = ({ config }) => {
  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? "";

  const plugins = (config.plugins ?? []).map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === "@badatgil/expo-mapbox-navigation") {
      return [plugin[0], { ...plugin[1], accessToken: mapboxToken }];
    }
    return plugin;
  });

  return { ...config, plugins };
};
