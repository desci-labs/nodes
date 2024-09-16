#!/bin/bash

set -e

# Configuration
DRIVER_URL="https://jdbc.postgresql.org/download/postgresql-42.7.3.jar"
DRIVER_DIR="/opt/logstash/drivers"
DRIVER_FILE="$DRIVER_DIR/postgresql-42.7.3.jar"

# Ensure the driver directory exists
mkdir -p "$DRIVER_DIR"


download_driver() {
    echo "Downloading PostgreSQL JDBC driver..."
    curl -# -o "$DRIVER_FILE" "$DRIVER_URL"
    chmod 644 "$DRIVER_FILE"
    echo "Driver downloaded and permissions set."
}

# Check if driver exists and download if necessary
if [ -f "$DRIVER_FILE" ]; then
    echo "PostgreSQL JDBC driver already exists."
else
    download_driver
fi

# Verify the driver file
if [ ! -f "$DRIVER_FILE" ]; then
    echo "Error: Failed to download or locate the PostgreSQL JDBC driver."
    exit 1
fi

# Ensure correct permissions on the driver file
chmod 644 "$DRIVER_FILE"

# Start Logstash with the provided pipeline configuration
exec logstash -f /usr/share/logstash/pipeline/logstash.conf