import React, { useEffect, useState } from 'react';
import mqtt from 'mqtt';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip);

export default function App() {
  const [telemetry, setTelemetry] = useState({
    turbine_id: 'Loading...',
    health_zone: 'Unknown',
    rms_velocity: 0,
    spectrum_peaks: new Array(50).fill(0), // Initial empty FFT array
  });

  useEffect(() => {
    // Connect to Mosquitto via Secure WebSockets
    // Note: The browser handles the mTLS certificate handshake natively
    const client = mqtt.connect('wss://localhost:8083', {
      clientId: 'react-dashboard',
      rejectUnauthorized: false, // For local self-signed dev testing
    });

    client.on('connect', () => {
      console.log('✅ Connected to EcoGuard WSS');
      client.subscribe('ecoguard/turbine/+/data');
    });

    client.on('message', (topic, message) => {
      const data = JSON.parse(message.toString());
      setTelemetry(data);
    });

    return () => client.end();
  }, []);

  // ---------------------------------------------------------
  // Chart.js Configuration (Optimized for 30fps)
  // ---------------------------------------------------------
  const chartData = {
    // Create generic X-axis labels for frequency bins
    labels: telemetry.spectrum_peaks.map((_, i) => `${i * 10}Hz`), 
    datasets: [
      {
        label: 'FFT Magnitude',
        data: telemetry.spectrum_peaks,
        backgroundColor: telemetry.health_zone.includes('Danger') ? 'rgba(255, 99, 132, 0.8)' : 'rgba(54, 162, 235, 0.8)',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    animation: false, // CRITICAL: Must be false to achieve 30fps rendering
    scales: {
      y: { suggestedMax: 5.0, beginAtZero: true },
      x: { display: false } // Hide X labels for cleaner high-speed rendering
    },
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', backgroundColor: '#1e1e1e', color: 'white', minHeight: '100vh' }}>
      <h1>EcoGuard Dashboard</h1>
      <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
        <div style={{ padding: '1rem', backgroundColor: '#333', borderRadius: '8px' }}>
          <h3>Turbine ID</h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{telemetry.turbine_id}</p>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#333', borderRadius: '8px' }}>
          <h3>Health State</h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: telemetry.health_zone.includes('Danger') ? '#ff4d4d' : '#4dff4d' }}>
            {telemetry.health_zone}
          </p>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#333', borderRadius: '8px' }}>
          <h3>RMS Velocity</h3>
          <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{telemetry.rms_velocity.toFixed(2)} mm/s</p>
        </div>
      </div>
      
      <div style={{ height: '400px', width: '100%', backgroundColor: '#2a2a2a', padding: '1rem', borderRadius: '8px' }}>
        <Bar data={chartData} options={chartOptions} />
      </div>
    </div>
  );
}