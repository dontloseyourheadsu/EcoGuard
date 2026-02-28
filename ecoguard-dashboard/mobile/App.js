import React, { useEffect, useState } from "react";
import { SafeAreaView, View, Text, FlatList, StyleSheet } from "react-native";
import mqtt from "mqtt/dist/mqtt";

export default function App() {
  const [telemetry, setTelemetry] = useState({
    turbine_id: "Loading...",
    health_zone: "Unknown",
    rms_velocity: 0,
    spectrum_peaks: new Array(32).fill(0),
  });

  useEffect(() => {
    // NOTE: In many RN environments mqtt.js needs extra shims.
    // This code works in an Expo web session or a properly configured native build.
    const client = mqtt.connect("wss://localhost:8083", {
      clientId: "react-native-dashboard",
      rejectUnauthorized: false,
    });

    client.on("connect", () => {
      console.log("Connected (mobile)");
      client.subscribe("ecoguard/turbine/+/data");
    });

    client.on("message", (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        setTelemetry(data);
      } catch (e) {
        console.warn("Failed parse message", e);
      }
    });

    return () => {
      try {
        client.end();
      } catch (e) {}
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>EcoGuard Mobile</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Turbine</Text>
        <Text style={styles.value}>{telemetry.turbine_id}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Health</Text>
        <Text
          style={[
            styles.value,
            telemetry.health_zone.includes("Danger")
              ? styles.danger
              : styles.ok,
          ]}
        >
          {telemetry.health_zone}
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>RMS Velocity</Text>
        <Text style={styles.value}>
          {telemetry.rms_velocity.toFixed
            ? telemetry.rms_velocity.toFixed(2)
            : telemetry.rms_velocity}{" "}
          mm/s
        </Text>
      </View>

      <Text style={{ marginTop: 12, color: "#ddd" }}>
        Spectrum peaks (first 16):
      </Text>
      <FlatList
        data={telemetry.spectrum_peaks.slice(0, 16)}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => (
          <Text style={styles.peak}>
            {index}: {item.toFixed ? item.toFixed(2) : item}
          </Text>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#141414", padding: 16 },
  title: { fontSize: 22, color: "white", marginBottom: 12 },
  card: {
    backgroundColor: "#222",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  label: { color: "#aaa", fontSize: 12 },
  value: { color: "white", fontSize: 18, fontWeight: "600" },
  danger: { color: "#ff6b6b" },
  ok: { color: "#7efc6e" },
  peak: { color: "#ccc", paddingVertical: 2 },
});
