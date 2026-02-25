use rumqttc::{AsyncClient, MqttOptions, QoS, Transport, TlsConfiguration};
use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH, Duration};
use std::fs;

/// Represents the final JSON payload sent to the broker.
#[derive(Serialize, Debug)]
pub struct TelemetryPayload {
    pub turbine_id: String,
    pub rms_velocity: f64,
    pub health_zone: String,
    pub spectrum_peaks: Vec<f64>, // Truncated or compressed array of FFT magnitudes
    pub timestamp: u64,
}

/// Establishes an asynchronous, mTLS-secured connection to the Mosquitto broker.
pub async fn setup_mqtt_client(client_id: &str, broker_host: &str, port: u16) -> AsyncClient {
    let mut mqttoptions = MqttOptions::new(client_id, broker_host, port);
    mqttoptions.set_keep_alive(Duration::from_secs(5));

    // Load the mTLS certificates generated earlier
    let ca = fs::read("certs/ca.crt").expect("Missing CA certificate");
    let client_cert = fs::read("certs/rust_agent.crt").expect("Missing Agent certificate");
    let client_key = fs::read("certs/rust_agent.key").expect("Missing Agent private key");

    // Configure strictly for mTLS
    let transport = Transport::Tls(TlsConfiguration::Simple {
        ca: ca.into(),
        alpn: None,
        client_auth: Some((client_cert.into(), client_key.into())),
    });

    mqttoptions.set_transport(transport);

    let (client, mut eventloop) = AsyncClient::new(mqttoptions, 10);

    // Spawn a background Tokio task to maintain the connection asynchronously
    tokio::spawn(async move {
        loop {
            // poll() drives the underlying network state machine
            match eventloop.poll().await {
                Ok(_event) => {} // Handle acks or incoming messages if needed
                Err(e) => {
                    eprintln!("Network interruption detected: {:?}. Retrying...", e);
                    tokio::time::sleep(Duration::from_secs(3)).await;
                }
            }
        }
    });

    client
}

/// Helper function to grab the current UNIX timestamp
pub fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards")
        .as_secs()
}