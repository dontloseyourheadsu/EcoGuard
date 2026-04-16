# EcoGuard: Arquitectura IoT Emulada para Gestión Predictiva de Microredes 🌬️⚡

[cite_start]EcoGuard es un sistema avanzado de monitoreo de condición diseñado para la gestión y el mantenimiento predictivo de microredes de energía renovable[cite: 1, 2, 121, 125].

## 🎯 Objetivo del Proyecto

[cite_start]El principal desafío en la industria energética es el alto costo asociado a fallos mecánicos no detectados en activos dispersos como turbinas eólicas [cite: 12, 132-134]. [cite_start]Los simuladores IoT tradicionales suelen generar datos aleatorios ("ruido") que no permiten validar algoritmos reales de mantenimiento predictivo[cite: 13].

[cite_start]**EcoGuard** resuelve esto implementando un "Gemelo Digital" emulado puramente en software (sobre Linux) que genera física de alta fidelidad sin necesidad de hardware[cite: 15, 126, 142, 143]. [cite_start]En lugar de números aleatorios, el sistema sintetiza ondas mecánicas complejas, procesa la Transformada Rápida de Fourier (FFT) en el borde y evalúa el estado de salud de la maquinaria utilizando el estándar industrial ISO 10816 [cite: 42, 59-64, 128, 174, 175].

---

## 🏗️ Arquitectura del Sistema

[cite_start]La arquitectura sigue un modelo distribuido y de "Confianza Cero" (Zero Trust), dividida en generación de borde, infraestructura de datos y capa de visualización[cite: 31, 204].

```mermaid
graph TD
    subgraph Host [Entorno de Ejecucion Linux]
        RustAgent[Agente Inteligente Rust<br/>Edge Computing / FFT]
        MQTTX[MQTT X CLI<br/>Generador de Carga / Caos]
        Web[React Dashboard Web<br/>Vite UI]
        Api[History API Node Express<br/>GET /api/history]
        App[React Native App<br/>Expo / Push Alerts]
    end

    subgraph Infra [Infraestructura de Datos Docker]
        Broker((Mosquitto Broker<br/>1883 / 8883 mTLS / 8083 WSS))
        Telegraf[Telegraf MQTT Consumer]
        Influx[(InfluxDB 2.x<br/>Bucket telemetry)]
    end

    RustAgent -- "Pub: ecoguard/turbine/+/data<br/>(TLS 8883)" --> Broker
    MQTTX -- "Pub: ecoguard/env/+/temp<br/>(Carga/Caos)" --> Broker

    Broker -- "Sub topics turbine" --> Telegraf
    Telegraf -- "Write time-series" --> Influx

    Web -- "Tiempo real: MQTT over WS/WSS" --> Broker
    Web -- "Historico: HTTP /api/history" --> Api
    Api -- "Flux Query API v2" --> Influx

    Broker -- "Eventos / Push triggers" --> App

```

### Componentes Principales

- **Agente Inteligente (Rust):** Binario nativo que emula el desgaste mecánico de la turbina, calcula la FFT y determina zonas de salud (A/B/C/D) .

- **Broker MQTT (Eclipse Mosquitto):** Enrutador central asegurado con autenticación mutua (mTLS) y listas de control de acceso (ACL).

- **Generador de Carga (MQTT X CLI):** Inyecta ruido ambiental masivo para validar la robustez y escalabilidad de la red .

- **Persistencia (InfluxDB + Telegraf):** Almacenamiento optimizado para métricas de series temporales de alta velocidad .

- **Ecosistema Reactivo:** Dashboard web (React) para ver el espectro FFT a 30fps y App Móvil (React Native) para gestión por excepción y alertas críticas .

---

## 🚀 Guía de Instalación y Despliegue

### ⚡ Flujo Rápido: Primera vez vs Arranque diario

Si ya creaste certificados, ACL y secretos, no necesitas repetir todo el setup.

**Primera vez (one-time):**

1. Generar certificados (`./generate_certs.sh`).
2. Confirmar ACL (`./mosquito/config/acl.conf`).
3. Crear secretos de Influx (`cp secrets/influxdb.env.example secrets/influxdb.env` y ajustar valores).
4. Levantar infraestructura (`docker compose up -d`).
5. Levantar agente Rust (`cd ecoguard-agent && cargo run`).
6. Levantar dashboard (`cd ecoguard-dashboard && npm install && npm run dev`).

**Arranque diario (ya todo creado):**

1. Levantar infraestructura:

```bash
docker compose up -d
```

2. Levantar agente Rust:

```bash
cd ecoguard-agent
cargo run
```

3. Levantar dashboard web:

```bash
cd ecoguard-dashboard
npm run dev
```

4. (Opcional) prueba de caos:

```bash
./run_chaos.sh
```

**Cuando SI debes repetir pasos one-time:**

- Regeneraste o vencieron certificados.
- Cambiaste identidades/ACLs de clientes MQTT.
- Cambiaste credenciales iniciales de Influx y reiniciaste estado de `./influxdb/data`.

### Requisitos Previos

- Sistema Operativo Linux (Recomendado: Fedora/Ubuntu).

- Docker y Docker Compose.

- Rust y Cargo (`rustup`).

- Node.js y npm.

- OpenSSL.

Nota Linux/Fedora:

- Si `docker compose up` falla con `docker-credential-desktop: executable file not found`, revisa `~/.docker/config.json` y elimina `"credsStore": "desktop"`.

### Paso 1: Configurar Seguridad y Certificados (mTLS)

El sistema requiere autenticación mutua. Debes generar tu propia Autoridad Certificadora (CA) y las llaves para cada cliente .

1. Ejecuta el script de generación de certificados: `./generate_certs.sh`.
2. Asegúrate de que los certificados se guarden en el directorio `./certs`. _(Nota: este directorio debe estar en tu `.gitignore`)_.

Nota importante sobre rutas de certificados:

- El script `generate_certs.sh` genera los certificados en `./certs` y además copia automáticamente los archivos necesarios a `./mosquito/config/certs` para que el broker Mosquitto (que monta `./mosquito/config`) tenga acceso a los mismos ficheros. Esto permite que Telegraf lea `./certs` mientras que Mosquitto utiliza `./mosquito/config/certs`.

- El certificado del broker incluye SAN para `localhost`, `127.0.0.1`, `ecoguard-broker` y `mosquitto`, evitando errores TLS de nombre (`NotValidForName`) en el agente Rust.

- `generate_certs.sh` permite exportar `dashboard.p12` sin prompt interactivo usando `DASHBOARD_P12_PASSWORD` (por defecto `changeit`).

- En Linux con contenedores, si hay `Permission denied` leyendo `broker.key`/`telegraf.key`, ajusta permisos de desarrollo local según sea necesario.

Si prefieres mantener los certificados en otra ubicación, actualiza `docker-compose.yaml` (montajes) y `mosquito/config/mosquito.conf` (rutas) correspondientemente.

### Paso 2: Configurar Reglas de Acceso (ACLs)

Mosquitto restringe quién puede publicar y suscribirse a los tópicos .

1. Coloca el archivo `acl.conf` dentro del directorio de configuración de Mosquitto (`./mosquito/config/`).
2. Verifica que el Agente Rust tenga permisos exclusivos de escritura (`pub`) y los dashboards permisos de lectura (`sub`).

Nota: para la prueba de caos local, el ACL también debe permitir publicación en `ecoguard/env/+/temp` para la identidad usada por el publicador de carga.

### Paso 3: Levantar la Infraestructura

Inicia el broker de mensajes y la base de datos de series temporales :

Antes de levantar contenedores, crea tu archivo local de secretos a partir de la plantilla:

```bash
cp secrets/influxdb.env.example secrets/influxdb.env
```

```bash
docker compose up -d

```

Nota Linux/Fedora (SELinux):

- En Fedora/SELinux, los montajes pueden requerir etiqueta `:Z` en `docker-compose.yaml` para evitar errores de acceso desde contenedores.

- Si cambias credenciales en `secrets/influxdb.env` y ya existe estado previo en `./influxdb/data`, reinicializa esa carpeta para evitar `401 Unauthorized` en Telegraf->InfluxDB.

Nota: el broker expone los puertos `1883`, `8883` (mTLS) y `8083` (WSS para el dashboard web). Asegúrate de no exponer estos puertos en entornos públicos sin las medidas de seguridad necesarias.

### Paso 4: Ejecutar el Gemelo Digital (Agente Rust)

Posiciónate en el directorio del agente Rust para comenzar a emular la física de la turbina eólica y enviar telemetría a Mosquitto .

```bash
cd ecoguard-agent
cargo run
```

### Paso 5: Prueba de Estrés (Generación de Caos)

Para validar que el sistema no se congele bajo estrés, ejecuta el generador de carga para simular sensores adicionales:

```bash
./run_chaos.sh

```

Nota: en este repositorio la prueba de caos publica con `mosquitto_pub` dentro de Docker y usa mTLS en `8883`.

### Paso 6: Configuración del Dashboard Web y Certificado del Navegador

El Dashboard en React usa WebSockets locales (`ws://localhost:8083`) para desarrollo rápido.

Si quieres ejecutar el dashboard con WSS + mTLS en navegador, debes configurar el listener seguro en Mosquitto y realizar importación de certificados cliente/CA en el navegador.

1. **(Opcional para WSS+mTLS) Empaquetar Certificado:** En la carpeta `certs/`, convierte tu certificado del dashboard a formato `.p12`:

```bash
openssl pkcs12 -export -out dashboard.p12 -inkey dashboard.key -in dashboard.crt -certfile ca.crt

```

2. **(Opcional para WSS+mTLS) Importar al Navegador:**
   Una vez que hayas generado el archivo `dashboard.p12`, necesitas cargarlo en el almacén de confianza de tu navegador.
   **Para Chrome / Edge:**

- Ve a Configuración > Privacidad y seguridad > Seguridad.
- Desplázate hacia abajo y haz clic en Gestionar certificados.
- Ve a la pestaña Tus certificados (o Personal) y haz clic en Importar.

**Para Firefox:**

- Ve a Ajustes > Privacidad & Seguridad.
- Desplázate hacia abajo hasta la sección Certificados y haz clic en Ver Certificados.
- Bajo la pestaña Tus Certificados, haz clic en Importar.

3. **Iniciar el Dashboard:**

```bash
cd ecoguard-dashboard
npm run dev

```

App móvil (React Native):

- Se ha añadido una app mínima de React Native en `ecoguard-dashboard/mobile/`. Puedes usar Expo para desarrollo rápido (`cd ecoguard-dashboard/mobile && npm install && npm run start`). Para despliegues móviles reales ten en cuenta que la gestión de certificados cliente (mTLS) normalmente requiere soporte nativo adicional o un proxy seguro.

---

**Nota de Seguridad:** NUNCA subas los archivos `.key` o el directorio `certs/` a repositorios públicos.

Sobre el ejemplo y privacidad:

- El archivo `generate_certs.sh.example` contiene un ejemplo con marcadores de posición (`<<INSERT_...>>`) para evitar exponer información sensible en el repositorio. Usa ese ejemplo como plantilla y ejecuta `generate_certs.sh` localmente para crear tus propios certificados con datos reales en tu equipo. Nunca incluyas llaves privadas ni certificados reales en commits públicos.
