# EcoGuard Dashboard (React + Vite)

Dashboard web para visualizacion de telemetria en tiempo real y exploracion historica en InfluxDB.

## Ejecutar en desarrollo

1. Crea el archivo de entorno para la API local:

```bash
cp .env.example .env
```

2. Ajusta el token y valores de InfluxDB en `.env`.

3. Instala dependencias y arranca todo (frontend + API):

```bash
npm install
npm run dev
```

El comando `npm run dev` levanta:

- Frontend Vite (por defecto en `5173`)
- API Node para historico (por defecto en `8787`)

Vite proxya `/api/*` hacia la API local en `8787`.

## Vista Historica

Incluye:

- Paginacion por lotes con cursor temporal.
- Auto-load al hacer scroll (infinite loading por batches).
- Filtro de salud: `Todos`, `Buenos (A/B)`, `Malos (C/D)`, `Peak (Zone D)`.
- Filtro por turbina (`T-01`, etc.).
- Filtro de tiempo por preset o rango manual (`Desde` / `Hasta`).

## API local (Node)

Endpoint principal:

- `GET /api/history`

Query params:

- `start` (ISO datetime)
- `stop` (ISO datetime)
- `limit` (1..1000)
- `cursor` (ISO datetime para siguiente batch)
- `healthFilter` (`all|good|bad|peak`)
- `turbineId` (opcional)

La API consulta InfluxDB y devuelve JSON ya normalizado para la UI.

## Build

```bash
npm run build
```

Para produccion puedes desplegar el frontend estatico y la API como servicio Node separado.
