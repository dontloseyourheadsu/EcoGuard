# Ecoguard Mobile (React Native)

This folder contains a minimal Expo-compatible React Native app that connects to the EcoGuard MQTT broker via WSS.

Quick start (development with Expo):

1. Install dependencies:

```bash
cd ecoguard-dashboard/mobile
npm install
```

2. Start Expo:

```bash
npm run start
```

Notes and caveats:

- The app uses `mqtt` (the browser/node library). In many React Native environments you will need additional shims or a native MQTT client to support mTLS client certificates.
- For local development you can run the Expo web session (it behaves like the web dashboard). For production mobile apps, add native support for client certificates or use a secure proxy/service that performs TLS termination.

Where to look:

- App source: `ecoguard-dashboard/mobile/App.js`
