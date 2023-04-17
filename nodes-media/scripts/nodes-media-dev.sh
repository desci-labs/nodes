
#!/bin/sh
cd /app

apt-get update && apt-get install -y graphicsmagick
apt-get install -y ghostscript

npm run dev