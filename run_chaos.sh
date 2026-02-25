#!/usr/bin/env bash

echo "Generating the env.js payload script..."

# This creates the env.js file needed by MQTT X CLI to simulate environmental noise
cat << 'EOF' > env.js
function generator(faker, options) {
  return {
    sensor_id: faker.datatype.uuid(),
    temperature: faker.datatype.number({ min: 10, max: 45 }),
    humidity: faker.datatype.number({ min: 30, max: 90 }),
    status: "noise"
  }
}
module.exports = generator;
EOF

echo "Starting MQTT X CLI Chaos Test (50 simulated sensors)..."

# Runs the MQTTX CLI from a docker container, aiming at your Mosquitto container
# We use host networking here so it can easily find localhost:1883
docker run --rm --network host -v $(pwd):/app -w /app emqx/mqttx-cli \
  mqttx simulate \
  --file env.js \
  --count 50 \
  --interval 100 \
  -h localhost \
  -p 1883 \
  -t 'ecoguard/env/+/temp'

echo "Chaos test complete!"