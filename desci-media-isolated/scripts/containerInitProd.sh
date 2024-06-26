#!/bin/bash

# Ensure temp directories exist
mkdir -p /usr/src/app/.temp/files /usr/src/app/.temp/thumbnails /usr/src/app/.temp/files/pdf /usr/src/app/.temp/pdf

# Execute the main container command
exec "$@"
