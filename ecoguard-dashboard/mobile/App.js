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
    // Use PC's IP address on the hotspot network
    const brokerIp = "192.168.160.222";
    const client = mqtt.connect(`ws://${brokerIp}:8083`, {
      clientId: "react-native-dashboard-" + Math.random().toString(16).substring(2, 8),
    });

    client.on("connect", () => {
      console.log("Connected (mobile)");
      client.subscribe("ecoguard/turbine/+/data");
    });

    client.on("message", (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        setTelemetry(data);
      } catch (err) {
        console.warn("Failed parse message", err);
      }
    });

    return () => {
      try {
        client.end();
      } catch (err) {
        console.error("Failed to disconnect MQTT", err);
      }
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
              : telemetry.health_zone.includes("Unsatisfactory")
              ? styles.warning
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
  warning: { color: "#f97316" },
  ok: { color: "#7efc6e" },
  peak: { color: "#ccc", paddingVertical: 2 },
});
