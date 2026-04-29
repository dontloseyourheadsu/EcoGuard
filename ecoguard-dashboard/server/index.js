/* global process */
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
const port = Number(process.env.HISTORY_API_PORT || 8787);

const influxUrl = process.env.INFLUX_URL || "http://localhost:8086";
const influxOrg = process.env.INFLUX_ORG || "EcoGuard";
const influxBucket = process.env.INFLUX_BUCKET || "telemetry";
const influxMeasurement = process.env.INFLUX_MEASUREMENT || "mqtt_consumer";
const influxToken = process.env.INFLUX_TOKEN || "";

const HEALTH_FILTER_ALL = "all";
const HEALTH_FILTER_GOOD = "good";
const HEALTH_FILTER_BAD = "bad";
const HEALTH_FILTER_PEAK = "peak";

const MAX_LIMIT = 1000;

function classifyHealth(healthZone) {
  if (healthZone === "Zone D (Danger)") {
    return "peak";
  }
  if (healthZone === "Zone C (Unsatisfactory)") {
    return "warning";
  }
  return "good";
}

function escapeFluxString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

function parseInfluxAnnotatedCsv(rawCsv) {
  const lines = rawCsv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  
  // Find the first non-comment line to establish headers
  const firstHeaderIndex = lines.findIndex(line => !line.startsWith("#"));
  if (firstHeaderIndex < 0) return [];

  const headers = parseCsvLine(lines[firstHeaderIndex]);
  const timeIndex = headers.indexOf("_time");
  const valueIndex = headers.indexOf("_value");
  const zoneIndex = headers.indexOf("health_zone");
  const turbineIndex = headers.indexOf("turbine_id");

  if (timeIndex < 0 || valueIndex < 0 || zoneIndex < 0 || turbineIndex < 0) {
    return [];
  }

  const results = [];
  // Skip the first header row and process everything else
  for (let i = firstHeaderIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#")) continue; // Skip annotation rows for new tables
    
    const columns = parseCsvLine(line);
    // Skip rows that match the header signature (which appear at the start of new tables)
    if (columns[timeIndex] === "_time") continue;

    const healthZone = columns[zoneIndex];
    results.push({
      time: columns[timeIndex],
      turbineId: columns[turbineIndex],
      rmsVelocity: Number(columns[valueIndex] || 0),
      healthZone,
      healthClass: classifyHealth(healthZone),
    });
  }

  return results;
}

function buildHistoryFluxQuery({
  start,
  stop,
  cursor,
  limit,
  healthFilter,
  turbineId,
}) {
  let zoneFilter = "";

  if (healthFilter === HEALTH_FILTER_GOOD) {
    zoneFilter =
      '|> filter(fn: (r) => r.health_zone == "Zone A (Good)" or r.health_zone == "Zone B (Acceptable)")';
  } else if (healthFilter === HEALTH_FILTER_BAD) {
    zoneFilter =
      '|> filter(fn: (r) => r.health_zone == "Zone C (Unsatisfactory)" or r.health_zone == "Zone D (Danger)")';
  } else if (healthFilter === HEALTH_FILTER_PEAK) {
    zoneFilter = '|> filter(fn: (r) => r.health_zone == "Zone D (Danger)")';
  }

  const turbineFilter = turbineId
    ? `|> filter(fn: (r) => r.turbine_id == "${escapeFluxString(turbineId)}")`
    : "";

  const cursorFilter = cursor
    ? `|> filter(fn: (r) => r._time > time(v: "${escapeFluxString(cursor)}"))`
    : "";

  return `
from(bucket: "${escapeFluxString(influxBucket)}")
  |> range(start: time(v: "${escapeFluxString(start)}"), stop: time(v: "${escapeFluxString(stop)}"))
  |> filter(fn: (r) => r._measurement == "${escapeFluxString(influxMeasurement)}")
  |> filter(fn: (r) => r._field == "rms_velocity")
  ${zoneFilter}
  ${turbineFilter}
  ${cursorFilter}
  |> sort(columns: ["_time"], desc: false)
  |> keep(columns: ["_time", "_value", "health_zone", "turbine_id"])
  |> limit(n: ${limit})
`;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/history", async (req, res) => {
  if (!influxToken) {
    res
      .status(500)
      .json({ error: "INFLUX_TOKEN no configurado en el servidor API." });
    return;
  }

  const limit = Math.min(
    Math.max(Number(req.query.limit || 200), 1),
    MAX_LIMIT,
  );
  const healthFilter = String(req.query.healthFilter || HEALTH_FILTER_ALL);
  const turbineId = req.query.turbineId
    ? String(req.query.turbineId).trim()
    : "";
  const cursor = req.query.cursor ? String(req.query.cursor) : null;

  const stopDate = req.query.stop
    ? new Date(String(req.query.stop))
    : new Date();
  const startDate = req.query.start
    ? new Date(String(req.query.start))
    : new Date(stopDate.getTime() - 24 * 60 * 60 * 1000);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(stopDate.getTime())) {
    res.status(400).json({ error: "Rango de tiempo invalido." });
    return;
  }

  if (startDate.getTime() >= stopDate.getTime()) {
    res.status(400).json({ error: "El inicio debe ser anterior al fin." });
    return;
  }

  const fluxQuery = buildHistoryFluxQuery({
    start: startDate.toISOString(),
    stop: stopDate.toISOString(),
    cursor,
    limit,
    healthFilter,
    turbineId,
  });

  try {
    const response = await fetch(
      `${influxUrl}/api/v2/query?org=${encodeURIComponent(influxOrg)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${influxToken}`,
          "Content-Type": "application/vnd.flux",
          Accept: "application/csv",
        },
        body: fluxQuery,
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      res
        .status(response.status)
        .json({ error: errorBody || "Error consultando InfluxDB." });
      return;
    }

    const csv = await response.text();
    const rows = parseInfluxAnnotatedCsv(csv);
    const hasMore = rows.length === limit;
    const nextCursor = rows.length > 0 ? rows[rows.length - 1].time : null;

    res.json({ rows, hasMore, nextCursor });
  } catch (error) {
    res
      .status(500)
      .json({ error: error.message || "Error interno en historial API." });
  }
});

app.listen(port, () => {
  console.log(`[history-api] running on http://localhost:${port}`);
});
