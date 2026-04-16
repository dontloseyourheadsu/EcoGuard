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
ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip);

const VIEW_LIVE = 'live';
const VIEW_HISTORY = 'history';

const HEALTH_FILTER_ALL = 'all';
const HEALTH_FILTER_GOOD = 'good';
const HEALTH_FILTER_BAD = 'bad';
const HEALTH_FILTER_PEAK = 'peak';

const TIME_PRESET_1H = '1h';
const TIME_PRESET_6H = '6h';
const TIME_PRESET_24H = '24h';
const TIME_PRESET_7D = '7d';
const TIME_PRESET_CUSTOM = 'custom';

const GOOD_ZONES = ['Zone A (Good)', 'Zone B (Acceptable)'];
const BAD_ZONES = ['Zone C (Unsatisfactory)'];
const PEAK_ZONES = ['Zone D (Danger)'];

function toLocalDatetimeValue(date) {
  const pad = (value) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function buildPresetRange(preset) {
  const stop = new Date();
  const start = new Date(stop);

  if (preset === TIME_PRESET_1H) {
    start.setHours(stop.getHours() - 1);
  } else if (preset === TIME_PRESET_6H) {
    start.setHours(stop.getHours() - 6);
  } else if (preset === TIME_PRESET_7D) {
    start.setDate(stop.getDate() - 7);
  } else {
    start.setHours(stop.getHours() - 24);
  }

  return {
    start: toLocalDatetimeValue(start),
    stop: toLocalDatetimeValue(stop),
  };
}

function classifyHealth(healthZone) {
  if (PEAK_ZONES.includes(healthZone)) {
    return 'peak';
  }
  if (BAD_ZONES.includes(healthZone)) {
    return 'bad';
  }
  return 'good';
}

export default function App() {
  const [viewMode, setViewMode] = useState(VIEW_LIVE);

  const [telemetry, setTelemetry] = useState({
    turbine_id: 'Loading...',
    health_zone: 'Unknown',
    rms_velocity: 0,
    spectrum_peaks: new Array(50).fill(0), // Initial empty FFT array
  });

  const [historyRows, setHistoryRows] = useState([]);
  const [historyCursor, setHistoryCursor] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyHasMore, setHistoryHasMore] = useState(false);

  const [historyTimePreset, setHistoryTimePreset] = useState(TIME_PRESET_24H);
  const initialRange = useMemo(() => buildPresetRange(TIME_PRESET_24H), []);
  const [historyStartTime, setHistoryStartTime] = useState(initialRange.start);
  const [historyStopTime, setHistoryStopTime] = useState(initialRange.stop);
  const [historyBatchSize, setHistoryBatchSize] = useState(200);
  const [historyFilter, setHistoryFilter] = useState(HEALTH_FILTER_ALL);
  const [historyTurbineFilter, setHistoryTurbineFilter] = useState('');

  const historySentinelRef = useRef(null);

  const liveHealthClass = useMemo(
    () => classifyHealth(telemetry.health_zone),
    [telemetry.health_zone],
  );

  const historySummary = useMemo(() => {
    return historyRows.reduce(
      (acc, row) => {
        if (row.healthClass === 'good') {
          acc.good += 1;
        } else if (row.healthClass === 'bad') {
          acc.bad += 1;
        } else {
          acc.peak += 1;
        }
        return acc;
      },
      { good: 0, bad: 0, peak: 0 },
    );
  }, [historyRows]);

  const recentRows = useMemo(() => historyRows.slice(-120), [historyRows]);

  const historyChartData = useMemo(() => {
    return {
      labels: recentRows.map((row) => new Date(row.time).toLocaleTimeString()),
      datasets: [
        {
          label: 'RMS Velocity (mm/s)',
          data: recentRows.map((row) => row.rmsVelocity),
          borderColor: '#3da9fc',
          backgroundColor: recentRows.map((row) => {
            if (row.healthClass === 'peak') {
              return '#ef4565';
            }
            if (row.healthClass === 'bad') {
              return '#f97316';
            }
            return '#2cb67d';
          }),
          pointRadius: 3,
          tension: 0.2,
        },
      ],
    };
  }, [recentRows]);

  const historyChartOptions = {
    responsive: true,
    animation: false,
    scales: {
      y: { beginAtZero: true, suggestedMax: 8 },
      x: { ticks: { maxTicksLimit: 8 } },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label(context) {
            const row = recentRows[context.dataIndex];
            const zone = row ? row.healthZone : 'Unknown';
            return `RMS: ${context.parsed.y.toFixed(2)} mm/s | ${zone}`;
          },
        },
      },
    },
  };

  const loadHistoryBatch = useCallback(
    async ({ reset = false } = {}) => {
      if (historyLoading) {
        return;
      }

      if (!historyStartTime || !historyStopTime) {
        setHistoryError('Debes indicar un rango de tiempo valido (inicio y fin).');
        return;
      }

      const startIso = new Date(historyStartTime).toISOString();
      const stopIso = new Date(historyStopTime).toISOString();

      if (Number.isNaN(new Date(startIso).getTime()) || Number.isNaN(new Date(stopIso).getTime())) {
        setHistoryError('El rango de tiempo no es valido.');
        return;
      }

      if (new Date(startIso).getTime() >= new Date(stopIso).getTime()) {
        setHistoryError('El inicio debe ser anterior al fin.');
        return;
      }

      setHistoryLoading(true);
      setHistoryError('');

      try {
        const afterTime = reset ? null : historyCursor;
        const searchParams = new URLSearchParams({
          limit: String(historyBatchSize),
          start: startIso,
          stop: stopIso,
          healthFilter: historyFilter,
        });

        if (afterTime) {
          searchParams.set('cursor', afterTime);
        }

        if (historyTurbineFilter.trim()) {
          searchParams.set('turbineId', historyTurbineFilter.trim());
        }

        const response = await fetch(`/api/history?${searchParams.toString()}`, {
          method: 'GET',
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`InfluxDB query fallo (${response.status}): ${errorBody}`);
        }

        const payload = await response.json();
        const nextBatch = Array.isArray(payload.rows)
          ? payload.rows.map((row) => ({
              ...row,
              key: `${row.time}_${row.turbineId}`,
              healthClass: row.healthClass || classifyHealth(row.healthZone),
            }))
          : [];

        setHistoryRows((prevRows) => {
          const baseRows = reset ? [] : prevRows;
          const merged = [...baseRows, ...nextBatch];

          const unique = new Map();
          merged.forEach((row) => unique.set(row.key, row));

          return Array.from(unique.values()).sort(
            (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
          );
        });

        setHistoryCursor(payload.nextCursor || null);
        setHistoryHasMore(Boolean(payload.hasMore));
      } catch (error) {
        setHistoryError(error.message || 'No se pudieron cargar datos historicos.');
      } finally {
        setHistoryLoading(false);
      }
    },
    [historyBatchSize, historyCursor, historyFilter, historyLoading, historyStartTime, historyStopTime, historyTurbineFilter],
  );

  useEffect(() => {
    // Connect to local Mosquitto via WebSockets.
    const client = mqtt.connect('ws://localhost:8083', {
      clientId: 'react-dashboard',
      username: 'react-dashboard',
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

  useEffect(() => {
    if (viewMode !== VIEW_HISTORY) {
      return;
    }

    setHistoryRows([]);
    setHistoryCursor(null);
    setHistoryHasMore(false);
    loadHistoryBatch({ reset: true });
  }, [viewMode, historyBatchSize, historyFilter, historyStartTime, historyStopTime, historyTurbineFilter, loadHistoryBatch]);

  useEffect(() => {
    if (viewMode !== VIEW_HISTORY || !historySentinelRef.current) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && historyHasMore && !historyLoading) {
          loadHistoryBatch({ reset: false });
        }
      },
      { rootMargin: '320px 0px' },
    );

    observer.observe(historySentinelRef.current);

    return () => observer.disconnect();
  }, [historyHasMore, historyLoading, loadHistoryBatch, viewMode]);

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