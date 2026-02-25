mod physics;
mod fft_processor;
mod mqtt_publisher;

use physics::VibrationSensor;
use fft_processor::{FftProcessor, MachineHealth};
use mqtt_publisher::{setup_mqtt_client, TelemetryPayload, current_timestamp};
use rumqttc::QoS;
use std::time::Duration;

#[tokio::main]
async fn main() {
    let turbine_id = "T-01";
    let publish_topic = format!("ecoguard/turbine/{}/data", turbine_id);
    
    // 1. Initialize the secure MQTT connection to our local Docker broker
    let mqtt_client = setup_mqtt_client("rust-agent-01", "localhost", 8883).await;

    // 2. Initialize the Digital Twin Physics and Math engines
    let sample_rate = 10000.0;
    let mut sensor = VibrationSensor::new(sample_rate, 25.0, 0.5);
    let processor = FftProcessor::new(sample_rate);

    println!("🚀 EcoGuard Rust Agent initialized. Streaming telemetry for {}...", turbine_id);

    // 3. The Continuous Edge Computing Loop
    loop {
        // Generate physical waveform (e.g., 2048 samples)
        let raw_signal = sensor.generate_samples(2048);
        
        // Compute FFT and ISO 10816 State
        let (rms, health, spectrum) = processor.analyze_vibration(&raw_signal);
        
        // Format the health state into a readable string
        let health_str = match health {
            MachineHealth::ZoneA => "Zone A (Good)",
            MachineHealth::ZoneB => "Zone B (Acceptable)",
            MachineHealth::ZoneC => "Zone C (Unsatisfactory)",
            MachineHealth::ZoneD => "Zone D (Danger)",
        };

        // Construct the JSON payload
        let payload = TelemetryPayload {
            turbine_id: turbine_id.to_string(),
            rms_velocity: rms,
            health_zone: health_str.to_string(),
            // To save bandwidth, we might only send the first 50 bins of the FFT
            spectrum_peaks: spectrum.into_iter().take(50).collect(), 
            timestamp: current_timestamp(),
        };

        let json_data = serde_json::to_string(&payload).expect("Failed to serialize telemetry");

        // Publish asynchronously using Quality of Service 1 (At least once)
        match mqtt_client.publish(&publish_topic, QoS::AtLeastOnce, false, json_data.clone()).await {
            Ok(_) => println!("Published -> {}", json_data),
            Err(e) => eprintln!("Failed to publish: {:?}", e),
        }

        // Wait 1 second before generating the next batch of data
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}