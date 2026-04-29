import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mqtt from 'mqtt';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import './App.css';

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

/**
 * LiveViewContainer manages its own MQTT connection and state.
 * This ensures "Live" updates never trigger re-renders in the "History" logic.
 */
const LiveViewContainer = () => {
  const [telemetry, setTelemetry] = useState({
    turbine_id: 'Connecting...',
    health_zone: 'Unknown',
    rms_velocity: 0,
    spectrum_peaks: new Array(60).fill(0),
  });

  useEffect(() => {
    console.log('📡 [LiveView] Initializing MQTT Connection...');
    const client = mqtt.connect('ws://localhost:8083', {
      clientId: 'react-live-' + Math.random().toString(16).substring(2, 8),
      clean: true,
      reconnectPeriod: 1000,
    });

    client.on('connect', () => {
      console.log('✅ [LiveView] Connected to Broker');
      client.subscribe('ecoguard/turbine/+/data');
    });

    client.on('message', (topic, message) => {
      try {
        const data = JSON.parse(message.toString());
        setTelemetry(data);
      } catch (error) {
        console.error('Invalid telemetry JSON', error);
      }
    });

    return () => {
      console.log('🔌 [LiveView] Closing MQTT Connection');
      client.end();
    };
  }, []);

  const liveHealthClass = useMemo(
    () => classifyHealth(telemetry.health_zone),
    [telemetry.health_zone],
  );

  const chartData = {
    labels: telemetry.spectrum_peaks.map((_, i) => `${i * 10}Hz`),
    datasets: [
      {
        label: 'FFT Magnitude',
        data: telemetry.spectrum_peaks,
        backgroundColor: liveHealthClass === 'peak' || liveHealthClass === 'bad' ? 'rgba(239, 69, 101, 0.85)' : 'rgba(61, 169, 252, 0.85)',
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      y: { suggestedMax: 5.0, beginAtZero: true },
      x: { display: true, ticks: { maxTicksLimit: 10 } }
    },
  };

  const currentHealthClassName = liveHealthClass === 'good' ? 'status-good' : 'status-bad';

  return (
    <>
      <div className="stats-row">
        <div className="stat-card">
          <h3>Turbine ID</h3>
          <p>{telemetry.turbine_id}</p>
        </div>
        <div className="stat-card">
          <h3>Health State</h3>
          <p className={currentHealthClassName}>{telemetry.health_zone}</p>
        </div>
        <div className="stat-card">
          <h3>RMS Velocity</h3>
          <p>{telemetry.rms_velocity.toFixed(2)} mm/s</p>
        </div>
      </div>

      <div className="chart-card live-chart-card" style={{ height: '400px' }}>
        <Bar data={chartData} options={chartOptions} />
      </div>
    </>
  );
};

const HistoryView = React.memo(({
  historyRows,
  historyLoading,
  historyError,
  historyHasMore,
  historySummary,
  historyStartTime,
  historyStopTime,
  historyTimePreset,
  historyBatchSize,
  historyTurbineFilter,
  historyFilter,
  historyChartData,
  historyChartOptions,
  onRefreshHistory,
  onLoadMoreHistory,
  onTimePresetChange,
  onStartTimeChange,
  onStopTimeChange,
  setHistoryBatchSize,
  setHistoryTurbineFilter,
  setHistoryFilter,
  historySentinelRef
}) => {
  return (
    <>
      <section className="history-controls">
        <div className="control-item">
          <label htmlFor="time-preset">Preset Tiempo</label>
          <select
            id="time-preset"
            value={historyTimePreset}
            onChange={onTimePresetChange}
          >
            <option value={TIME_PRESET_1H}>Ultima hora</option>
            <option value={TIME_PRESET_6H}>Ultimas 6 horas</option>
            <option value={TIME_PRESET_24H}>Ultimas 24 horas</option>
            <option value={TIME_PRESET_7D}>Ultimos 7 dias</option>
            <option value={TIME_PRESET_CUSTOM}>Custom</option>
          </select>
        </div>

        <div className="control-item">
          <label htmlFor="start-time">Desde</label>
          <input
            id="start-time"
            type="datetime-local"
            value={historyStartTime}
            onChange={onStartTimeChange}
          />
        </div>

        <div className="control-item">
          <label htmlFor="stop-time">Hasta</label>
          <input
            id="stop-time"
            type="datetime-local"
            value={historyStopTime}
            onChange={onStopTimeChange}
          />
        </div>

        <div className="control-item">
          <label htmlFor="batch-size">Batch Size</label>
          <select
            id="batch-size"
            value={historyBatchSize}
            onChange={(event) => setHistoryBatchSize(Number(event.target.value))}
          >
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
        </div>

        <div className="control-item">
          <label htmlFor="turbine-filter">Turbina</label>
          <input
            id="turbine-filter"
            type="text"
            value={historyTurbineFilter}
            onChange={(event) => setHistoryTurbineFilter(event.target.value)}
            placeholder="Ej: T-01"
          />
        </div>

        <div className="control-item">
          <label htmlFor="health-filter">Filtro Salud</label>
          <select
            id="health-filter"
            value={historyFilter}
            onChange={(event) => setHistoryFilter(event.target.value)}
          >
            <option value={HEALTH_FILTER_ALL}>Todos</option>
            <option value={HEALTH_FILTER_GOOD}>Solo Buenos (A/B)</option>
            <option value={HEALTH_FILTER_BAD}>Solo Malos (C/D)</option>
            <option value={HEALTH_FILTER_PEAK}>Solo Peak (Zone D)</option>
          </select>
        </div>

        <div className="control-actions">
          <button type="button" onClick={onRefreshHistory} disabled={historyLoading}>
            {historyLoading ? 'Consultando...' : 'Refrescar'}
          </button>
          <button type="button" onClick={onLoadMoreHistory} disabled={historyLoading || !historyHasMore}>
            Cargar mas
          </button>
        </div>
      </section>

      {historyError && <p className="history-error">{historyError}</p>}

      <section className="history-summary">
        <article className="summary-card summary-good">
          <h4>Buenos</h4>
          <strong>{historySummary.good}</strong>
        </article>
        <article className="summary-card summary-bad">
          <h4>Malos</h4>
          <strong>{historySummary.bad}</strong>
        </article>
        <article className="summary-card summary-peak">
          <h4>Peak (Danger)</h4>
          <strong>{historySummary.peak}</strong>
        </article>
      </section>

      <div className="chart-card history-chart-card">
        <Line data={historyChartData} options={historyChartOptions} />
      </div>

      <section className="history-table-wrap">
        <table className="history-table">
          <thead>
            <tr>
              <th>Hora</th>
              <th>Turbina</th>
              <th>RMS (mm/s)</th>
              <th>Health</th>
            </tr>
          </thead>
          <tbody>
            {historyRows.map((row) => (
              <tr key={row.key}>
                <td>{new Date(row.time).toLocaleString()}</td>
                <td>{row.turbineId}</td>
                <td>{row.rmsVelocity.toFixed(2)}</td>
                <td>
                  <span
                    className={`health-badge ${
                      row.healthClass === 'good'
                        ? 'health-good'
                        : row.healthClass === 'peak'
                          ? 'health-peak'
                          : 'health-bad'
                    }`}
                  >
                    {row.healthZone}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {historyRows.length === 0 && !historyLoading && !historyError && (
          <p className="history-empty">No hay datos para los filtros seleccionados.</p>
        )}
        {historyHasMore && (
          <div className="history-autoload" ref={historySentinelRef}>
            {historyLoading ? 'Cargando siguiente batch...' : 'Auto-load activo al hacer scroll'}
          </div>
        )}
      </section>
    </>
  );
});

export default function App() {
  const [viewMode, setViewMode] = useState(VIEW_LIVE);

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
  const [debouncedTurbineFilter, setDebouncedTurbineFilter] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTurbineFilter(historyTurbineFilter);
    }, 500);
    return () => clearTimeout(timer);
  }, [historyTurbineFilter]);

  const historySentinelRef = useRef(null);

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

  const historyChartOptions = useMemo(() => {
    return {
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
  }, [recentRows]);

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

      try {
        setHistoryLoading(true);
        setHistoryError('');
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

        if (debouncedTurbineFilter.trim()) {
          searchParams.set('turbineId', debouncedTurbineFilter.trim());
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
    [historyBatchSize, historyCursor, historyFilter, historyLoading, historyStartTime, historyStopTime, debouncedTurbineFilter],
  );

  useEffect(() => {
    if (viewMode !== VIEW_HISTORY) {
      return;
    }

    setHistoryRows([]);
    setHistoryCursor(null);
    setHistoryHasMore(false);
    loadHistoryBatch({ reset: true });
  }, [viewMode, historyBatchSize, historyFilter, historyStartTime, historyStopTime, debouncedTurbineFilter]); 

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

  const onRefreshHistory = useCallback(() => {
    setHistoryRows([]);
    setHistoryCursor(null);
    setHistoryHasMore(false);
    loadHistoryBatch({ reset: true });
  }, [loadHistoryBatch]);

  const onLoadMoreHistory = useCallback(() => {
    loadHistoryBatch({ reset: false });
  }, [loadHistoryBatch]);

  const onTimePresetChange = useCallback((event) => {
    const preset = event.target.value;
    setHistoryTimePreset(preset);
    if (preset === TIME_PRESET_CUSTOM) {
      return;
    }
    const nextRange = buildPresetRange(preset);
    setHistoryStartTime(nextRange.start);
    setHistoryStopTime(nextRange.stop);
  }, []);

  const onStartTimeChange = useCallback((event) => {
    setHistoryTimePreset(TIME_PRESET_CUSTOM);
    setHistoryStartTime(event.target.value);
  }, []);

  const onStopTimeChange = useCallback((event) => {
    setHistoryTimePreset(TIME_PRESET_CUSTOM);
    setHistoryStopTime(event.target.value);
  }, []);

  return (
    <div className="app-shell">
      <header className="header-row">
        <h1>EcoGuard Dashboard</h1>
        <div className="view-switch">
          <button
            type="button"
            className={viewMode === VIEW_LIVE ? 'is-active' : ''}
            onClick={() => setViewMode(VIEW_LIVE)}
          >
            Tiempo Real
          </button>
          <button
            type="button"
            className={viewMode === VIEW_HISTORY ? 'is-active' : ''}
            onClick={() => setViewMode(VIEW_HISTORY)}
          >
            Historico
          </button>
        </div>
      </header>

      <main className="view-container">
        {viewMode === VIEW_LIVE && (
          <LiveViewContainer />
        )}

        {viewMode === VIEW_HISTORY && (
          <HistoryView
            historyRows={historyRows}
            historyLoading={historyLoading}
            historyError={historyError}
            historyHasMore={historyHasMore}
            historySummary={historySummary}
            historyStartTime={historyStartTime}
            historyStopTime={historyStopTime}
            historyTimePreset={historyTimePreset}
            historyBatchSize={historyBatchSize}
            historyTurbineFilter={historyTurbineFilter}
            historyFilter={historyFilter}
            historyChartData={historyChartData}
            historyChartOptions={historyChartOptions}
            onRefreshHistory={onRefreshHistory}
            onLoadMoreHistory={onLoadMoreHistory}
            onTimePresetChange={onTimePresetChange}
            onStartTimeChange={onStartTimeChange}
            onStopTimeChange={onStopTimeChange}
            setHistoryBatchSize={setHistoryBatchSize}
            setHistoryTurbineFilter={setHistoryTurbineFilter}
            setHistoryFilter={setHistoryFilter}
            historySentinelRef={historySentinelRef}
          />
        )}
      </main>
    </div>
  );
}
