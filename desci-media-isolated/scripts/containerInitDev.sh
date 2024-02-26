#!/bin/bash

# Check if .env file does not exist and auto generate it from .example.env
if [ ! -f /usr/src/app/.env ]; then
  cp /usr/src/app/.env.example /usr/src/app/.env
fi

# Ensure temp directories exist
mkdir -p /usr/src/app/.temp/files /usr/src/app/.temp/thumbnails


# Check if node_modules directory doesn't exist and run npm install if necessary
if [ ! -d "/usr/src/app/node_modules" ]; then
  echo "node_modules not found, running npm install..."
  cd /usr/src/app
  npm install
fi

# Execute the main container command
exec "$@"
