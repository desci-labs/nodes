#!/bin/bash

# Ensure temp directories exist
mkdir -p /usr/src/app/.temp/files /usr/src/app/.temp/thumbnails

# Execute the main container command
exec "$@"
