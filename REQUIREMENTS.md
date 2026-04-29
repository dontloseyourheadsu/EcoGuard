# Requerimientos del Sistema EcoGuard (Arquitectura IoT Emulada)

## 1. Entorno Base
- [x] Sistema operativo Linux (Ubuntu/Fedora)
- [x] Soporte para contenedores (Docker)
- [x] Capacidad de ejecución concurrente (multi-proceso / multi-hilo)
- [x] Recursos suficientes (CPU, RAM, red)

## 2. Capa de Emulación (Core del Sistema)
- [x] Agente inteligente desarrollado en Rust
- [x] Ejecución como servicio (systemd) *(Logrado vía deploy_agent.sh)*
- [x] Simulación de sensores:
  - [x] Vibración (acelerómetro piezoeléctrico ~10 kHz)
  - [x] Variables ambientales *(Simuladas vía MQTT X/Chaos)*
- [x] Generación de señales físicas realistas:
  - [x] Ondas sinusoidales + armónicos (1x, 2x, 3x)
  - [x] Ruido gaussiano
- [x] Procesamiento en borde:
  - [x] Transformada Rápida de Fourier (FFT)
- [x] Modelo de gemelo digital (digital twin)
- [x] Configuración de frecuencia de envío de datos

## 3. Generación de Carga / Simulación Masiva
- [x] MQTT X CLI para:
  - [x] Simulación de múltiples dispositivos
  - [x] Pruebas de estrés
  - [x] Inyección de tráfico concurrente (`run_chaos.sh`)

## 4. Capa de Comunicación
- [x] Protocolo principal:
  - [x] MQTT 3.1.1/5.0 (pub/sub)
- [x] Broker:
  - [x] Eclipse Mosquitto
- [x] Transporte:
  - [x] TCP/IP
- [x] Puertos:
  - [x] 8883 (MQTT sobre TLS)
  - [x] 8083 (WebSockets seguros / WSS)
- [x] QoS:
  - [x] Nivel 1 (At least once)

## 5. Conectividad de Red
### LAN (implementación actual)
- [x] Wi-Fi / Localhost (clientes y dashboards)

## 6. Topología de Red
- [x] Topología estrella
- [x] Broker MQTT como nodo central
- [x] Gestión centralizada de conexiones
- [x] Escalabilidad a múltiples nodos

## 7. Seguridad (Zero Trust)
- [x] Infraestructura PKI:
  - [x] Autoridad certificadora (CA) propia
  - [x] Certificados X.509 por componente (Agent, Broker, Telegraf, Dashboard)
- [x] Autenticación:
  - [x] mTLS (mutua)
- [x] Cifrado:
  - [x] TLS 1.3 / 1.2 con certificados locales
- [x] Control de acceso:
  - [x] ACL por tópico MQTT (`acl.conf`)
- [x] Eliminación de contraseñas estáticas (uso de certificados)

## 8. Capa de Persistencia
- [x] Base de datos:
  - [x] InfluxDB 2.x (series temporales)
- [x] Escritura de alta frecuencia
- [x] Almacenamiento histórico
- [x] Integración con:
  - [x] Telegraf (ingestión mTLS -> InfluxDB)

## 9. Capa de Procesamiento de Datos
- [x] Parsing de mensajes JSON
- [x] Transformación de datos
- [x] Cálculo de métricas:
  - [x] RMS velocity
  - [x] Espectro FFT
- [x] Clasificación de estado:
  - [x] Zonas ISO 10816 (A/B/C/D)

## 10. Protocolos de Acceso a Datos
- [x] MQTT (tiempo real)
- [x] WebSockets (WSS) para dashboards
- [x] REST API (HTTP) para consultas históricas (Node.js Express)

## 11. Formato de Datos
### Actual:
- [x] JSON (legible, interoperable)

## 12. Estructura de Mensajes
- [x] Tópicos MQTT:
  - [x] `ecoguard/turbine/{id}/data`
- [x] Payload incluye:
  - [x] `turbine_id`
  - [x] `rms_velocity`
  - [x] `health_zone`
  - [x] `spectrum_peaks` (FFT)
  - [x] `timestamp`

## 13. Capa de Visualización
### Web
- [x] Dashboard en React (Vite)
- [x] Visualización en tiempo real:
  - [x] FFT (30 fps vía Chart.js optimizado)
  - [x] KPIs (RMS, estado con badges de color)
- [x] Conexión vía WSS/WS

### Móvil
- [x] App en React Native (Expo) - *Estructura base presente*
- [x] Gestión por excepción (visualización de estados críticos)

## 14. Gestión de Eventos y Alertas
- [x] Detección de condiciones críticas (Zona D)
- [x] Historial de eventos (vía InfluxDB/History API)

## 15. Escalabilidad
- [x] Soporte para múltiples agentes
- [x] Manejo de conexiones concurrentes
- [x] Arquitectura desacoplada (pub/sub)

## 16. Requerimientos de Fidelidad
- [x] Simulación física realista (basada en armónicos mecánicos)
- [x] Modelado de:
  - [x] Vibraciones (1x, 2x, 3x harmonics)
  - [x] Desgaste (bearing noise)
  - [x] Ruido gaussiano

## 17. Monitoreo y Diagnóstico
- [x] Estado de conexión de nodos (Logs del Agente y API)
- [x] Métricas del broker (vía logs de Mosquitto)
- [x] Análisis de tráfico

## 18. Restricciones del Sistema
- [x] No uso de hardware físico (100% emulado en software)
- [x] Alta fidelidad de simulación
- [x] Ejecución distribuida en contenedores

---

## 🚀 Extras Agregados (Valor Añadido)
- **Aislamiento de Vistas (Performance):** Los componentes Live y History están aislados mediante `React.memo`, evitando que el flujo de datos en tiempo real (1s) refresque innecesariamente la UI de historial.
- **Vista Histórica Avanzada:** Dashboard con integración completa a la History API para visualizar datos pasados.
- **Paginación Basada en Cursor:** API de historial optimizada que utiliza cursores temporales de InfluxDB para cargar grandes volúmenes de datos sin sobrecarga.
- **Filtrado Multi-parámetro:**
  - Filtrado por ID de turbina específico.
  - Filtrado por zonas de salud ISO (Solo Buenos, Solo Malos, Solo Críticos).
  - Presets de tiempo rápidos (1h, 6h, 24h, 7d) y rango custom.
- **Seguridad mTLS End-to-End:** Implementación real de autenticación mutua entre el Agente Rust, Telegraf y el Broker, incluyendo scripts de generación de CA.
- **Gráficos de Tendencia Histórica:** Visualización de la evolución de la velocidad RMS a lo largo del tiempo con codificación de colores por estado de salud.
- **Resiliencia de Conexión:** El Agente Rust incluye lógica de reintento automático y manejo de interrupciones de red.
