#!/bin/bash

# Check if .env file does not exist and auto generate it from .example.env
if [ ! -f /usr/src/app/.env ]; then
  cp /usr/src/app/.env.example /usr/src/app/.env
fi

# Ensure temp directories exist
mkdir -p /usr/src/app/.temp/files /usr/src/app/.temp/thumbnails /usr/src/app/.temp/files/pdf /usr/src/app/.temp/pdf


echo "Running npm install to install any package changes..."
cd /usr/src/app
npm install


# Execute the main container command
exec "$@"
