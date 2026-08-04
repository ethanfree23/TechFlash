/**
 * Extends static config from app.json with env-driven Maps keys and notification plugin.
 * Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY for native Maps (Android/iOS).
 */
module.exports = ({ config }) => {
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  return {
    ...config,
    plugins: [...(config.plugins || []), 'expo-font', ['expo-notifications', { color: '#FE6711' }]],
    android: {
      ...config.android,
      config: {
        ...(config.android?.config || {}),
        googleMaps: {
          apiKey: mapsKey,
        },
      },
    },
    ios: {
      ...config.ios,
      config: {
        ...(config.ios?.config || {}),
        googleMapsApiKey: mapsKey,
        usesNonExemptEncryption: false,
      },
    },
  };
};
