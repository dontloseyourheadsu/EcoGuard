use num_complex::Complex;
use rustfft::FftPlanner;

/// Represents the health state of the machine based on ISO 10816 standards.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MachineHealth {
    ZoneA, // Good: Newly commissioned machinery
    ZoneB, // Acceptable: Unrestricted long-term operation
    ZoneC, // Unsatisfactory: Limited operation, plan maintenance
    ZoneD, // Danger: High risk of damage
}

pub struct FftProcessor {
    pub sample_rate: f64,
}

impl FftProcessor {
    pub fn new(sample_rate: f64) -> Self {
        Self { sample_rate }
    }

    /// Ingests raw time-domain samples, computes the FFT, calculates RMS velocity,
    /// and maps it to an ISO 10816 health zone.
    pub fn analyze_vibration(&self, samples: &[f64]) -> (f64, MachineHealth, Vec<f64>) {
        let n = samples.len();
        
        // 1. Calculate RMS Velocity
        // The ISO 10816 standard evaluates health based on the root mean square of vibration velocity.
        let sum_sq: f64 = samples.iter().map(|&x| x * x).sum();
        let rms_velocity = (sum_sq / n as f64).sqrt();

        // 2. Map to ISO 10816-3 Thresholds (Example for Class II / Medium size machines on rigid foundations)
        let health_zone = match rms_velocity {
            v if v < 1.4 => MachineHealth::ZoneA,
            v if v < 2.8 => MachineHealth::ZoneB,
            v if v < 7.1 => MachineHealth::ZoneC,
            _ => MachineHealth::ZoneD,
        };

        // 3. Prepare data for the Fast Fourier Transform (FFT)
        // Convert real amplitudes to complex numbers (real + imaginary parts)
        let mut buffer: Vec<Complex<f64>> = samples
            .iter()
            .map(|&val| Complex { re: val, im: 0.0 })
            .collect();

        // 4. Perform the FFT in-place using rustfft
        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(n);
        fft.process(&mut buffer);

        // 5. Extract the magnitude for the frequency spectrum (up to the Nyquist frequency)
        // This is what the React Dashboard will visualize to diagnose specific faults
        let mut magnitudes = Vec::with_capacity(n / 2);
        for complex_val in buffer.iter().take(n / 2) {
            // Normalize the magnitude based on the number of samples
            let mag = complex_val.norm() / (n as f64 / 2.0);
            magnitudes.push(mag);
        }

        (rms_velocity, health_zone, magnitudes)
    }
}