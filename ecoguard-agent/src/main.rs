mod physics;
mod fft_processor;
mod mqtt_publisher;

use physics::{VibrationSensor, MechanicalState};
use fft_processor::{FftProcessor, MachineHealth};
use mqtt_publisher::{setup_mqtt_client, TelemetryPayload, current_timestamp};
use rumqttc::QoS;
use std::time::Duration;
use rand::Rng;

#[tokio::main]
async fn main() {
    let turbine_id = "T-01";
    let publish_topic = format!("ecoguard/turbine/{}/data", turbine_id);
    let mqtt_client = setup_mqtt_client("rust-agent-01", "localhost", 1883).await;

    let sample_rate = 10000.0;
    let mut sensor = VibrationSensor::new(sample_rate, 25.0);
    let processor = FftProcessor::new(sample_rate);
    
    println!("🚀 EcoGuard Agent: Stochastic Fault Injection Mode Enabled.");

    let mut rng = rand::thread_rng();

    loop {
        // 1. Determine Current Mechanical State
        // Baseline is healthy, but we inject a 10% chance of a transient anomaly
        let mut state = MechanicalState::healthy();
        
        let anomaly_roll: f32 = rng.gen_range(0.0..1.0);
        
        if anomaly_roll < 0.05 {
            println!("⚠️ Injection: Transient Misalignment (2x peak)");
            state.misalignment = 6.5; // Will push to Zone C/D
        } else if anomaly_roll < 0.08 {
            println!("⚠️ Injection: Foundation Looseness (3x peak)");
            state.looseness = 8.0;
        } else if anomaly_roll < 0.10 {
            println!("🚨 Injection: Critical Bearing Wear (High-freq peak)");
            state.bearing_wear = 12.0;
            state.noise_floor = 2.5;
        }

        // 2. Synthesis & Analysis
        let raw_signal = sensor.generate_samples(2048, state);
        let (rms, health, spectrum) = processor.analyze_vibration(&raw_signal);
        
        let health_str = match health {
            MachineHealth::ZoneA => "Zone A (Good)",
            MachineHealth::ZoneB => "Zone B (Acceptable)",
            MachineHealth::ZoneC => "Zone C (Unsatisfactory)",
            MachineHealth::ZoneD => "Zone D (Danger)",
        };

        // 3. Payload Construction
        let payload = TelemetryPayload {
            turbine_id: turbine_id.to_string(),
            rms_velocity: rms,
            health_zone: health_str.to_string(),
            spectrum_peaks: spectrum.into_iter().take(512).collect(), 
            timestamp: current_timestamp(),
        };

        let json_data = serde_json::to_string(&payload).expect("Serialization failed");

        // 4. Dispatch
        match mqtt_client.publish(&publish_topic, QoS::AtLeastOnce, false, json_data).await {
            Ok(_) => if health != MachineHealth::ZoneA && health != MachineHealth::ZoneB {
                 println!("📡 Published Anomaly: {} (RMS: {:.2})", health_str, rms);
            },
            Err(e) => eprintln!("MQTT Error: {:?}", e),
        }

        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}
