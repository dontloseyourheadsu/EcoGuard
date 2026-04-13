#!/usr/bin/env bash

echo "Starting chaos test with Dockerized mosquitto_pub (50 simulated sensors)..."

# Publish synthetic environmental messages to the local broker over TCP (1883).
# This avoids host package installs and keeps execution portable.
docker run --rm --network host -v "$(pwd)/certs:/certs:ro" eclipse-mosquitto:latest sh -c '
  i=1
  while [ "$i" -le 500 ]; do
    sensor=$(( (i % 50) + 1 ))
    temp=$(( (RANDOM % 35) + 10 ))
    hum=$(( (RANDOM % 60) + 30 ))
    ts=$(date +%s)
    payload=$(printf "{\"sensor_id\":\"env-%02d\",\"temperature\":%d,\"humidity\":%d,\"status\":\"noise\",\"timestamp\":%s}" "$sensor" "$temp" "$hum" "$ts")
    mosquitto_pub -h localhost -p 8883 --cafile /certs/ca.crt --cert /certs/rust_agent.crt --key /certs/rust_agent.key -t "ecoguard/env/$sensor/temp" -m "$payload"
    i=$((i + 1))
    sleep 0.1
  done
'

echo "Chaos test complete!"