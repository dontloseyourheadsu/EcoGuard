use rand::thread_rng;
use rand_distr::{Distribution, Normal};
use std::f64::consts::PI;

/// Represents the physical state and signal generation of a turbine.
pub struct VibrationSensor {
    pub sample_rate: f64,       // In Hz (e.g., 10,000 Hz for high-fidelity simulation)
    pub fundamental_freq: f64,  // In Hz (e.g., 25 Hz representing 1500 RPM)
    pub noise_std_dev: f64,     // Standard deviation for Gaussian friction noise
    time: f64,                  // Internal continuous time tracker
}

impl VibrationSensor {
    /// Initializes a new emulated vibration sensor.
    pub fn new(sample_rate: f64, fundamental_freq: f64, noise_std_dev: f64) -> Self {
        Self {
            sample_rate,
            fundamental_freq,
            noise_std_dev,
            time: 0.0,
        }
    }

    /// Generates a chunk of time-domain vibration data.
    /// Returns a vector of f64 amplitudes representing the physical waveform.
    pub fn generate_samples(&mut self, num_samples: usize) -> Vec<f64> {
        let mut rng = thread_rng();
        // Initialize Gaussian noise distribution to simulate friction
        let normal_dist = Normal::new(0.0, self.noise_std_dev).expect("Invalid noise parameters");
        
        let mut samples = Vec::with_capacity(num_samples);
        let dt = 1.0 / self.sample_rate;

        for _ in 0..num_samples {
            // 1. Fundamental Frequency (1x RPM - The main rotation of the shaft)
            let base_wave = (2.0 * PI * self.fundamental_freq * self.time).sin() * 2.5;
            
            // 2. 2x Harmonic (Simulates angular misalignment in the coupling)
            let harmonic_2x = (2.0 * PI * (self.fundamental_freq * 2.0) * self.time).sin() * 0.8;
            
            // 3. 3x Harmonic (Simulates mechanical looseness in the foundation)
            let harmonic_3x = (2.0 * PI * (self.fundamental_freq * 3.0) * self.time).sin() * 0.3;

            // 4. High-Frequency Component (Simulates early bearing wear)
            let bearing_noise = (2.0 * PI * 2500.0 * self.time).sin() * 0.4;

            // 5. Gaussian Noise (Simulates random environmental and friction noise)
            let friction_noise = normal_dist.sample(&mut rng);

            // Composite signal construction
            let amplitude = base_wave + harmonic_2x + harmonic_3x + bearing_noise + friction_noise;
            samples.push(amplitude);

            // Advance the internal clock
            self.time += dt;
        }

        samples
    }
}