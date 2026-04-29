use rand::thread_rng;
use rand_distr::{Distribution, Normal};
use std::f64::consts::PI;

/// Defines specific mechanical fault intensities.
#[derive(Clone, Copy)]
pub struct MechanicalState {
    pub imbalance: f64,      // 1x Harmonic (Mass distribution)
    pub misalignment: f64,   // 2x Harmonic (Coupling/Alignment)
    pub looseness: f64,      // 3x Harmonic (Foundation/Mounts)
    pub bearing_wear: f64,   // High-frequency acoustic emission (>2kHz)
    pub noise_floor: f64,    // Background friction
}

impl MechanicalState {
    pub fn healthy() -> Self {
        Self {
            imbalance: 1.0,
            misalignment: 0.3,
            looseness: 0.1,
            bearing_wear: 0.2,
            noise_floor: 0.4,
        }
    }
}

pub struct VibrationSensor {
    pub sample_rate: f64,
    pub fundamental_freq: f64, // f0 (Rotation frequency)
    time: f64,
}

impl VibrationSensor {
    pub fn new(sample_rate: f64, fundamental_freq: f64) -> Self {
        Self {
            sample_rate,
            fundamental_freq,
            time: 0.0,
        }
    }

    /// Generates samples by synthesizing the mechanical signature of the provided state.
    pub fn generate_samples(&mut self, num_samples: usize, state: MechanicalState) -> Vec<f64> {
        let mut rng = thread_rng();
        let normal_dist = Normal::new(0.0, state.noise_floor).expect("Invalid noise");
        
        let mut samples = Vec::with_capacity(num_samples);
        let dt = 1.0 / self.sample_rate;

        for _ in 0..num_samples {
            // 1x: Primary shaft rotation (Imbalance signature)
            let f1 = (2.0 * PI * self.fundamental_freq * self.time).sin() * (2.0 * state.imbalance);
            
            // 2x: Angular misalignment signature
            let f2 = (2.0 * PI * (self.fundamental_freq * 2.0) * self.time).sin() * (1.2 * state.misalignment);
            
            // 3x: Mechanical looseness signature (impact-like harmonics)
            let f3 = (2.0 * PI * (self.fundamental_freq * 3.0) * self.time).sin() * (0.8 * state.looseness);

            // Bearing wear: High-frequency resonance (simulating ball-pass frequency)
            // We use a higher carrier frequency (e.g., 2500Hz) modulated slightly
            let bearing = (2.0 * PI * 2500.0 * self.time).sin() * (0.5 * state.bearing_wear);

            // Stochastic noise floor
            let noise = normal_dist.sample(&mut rng);

            let amplitude = f1 + f2 + f3 + bearing + noise;
            samples.push(amplitude);

            self.time += dt;
        }

        samples
    }
}
