#!/bin/sh
cd /app

# Compile worker threads (they can't run as TypeScript in worker threads)
echo "Compiling worker to JavaScript..."
mkdir -p src/workers
npx tsc src/workers/mystBuildWorker.ts --outDir src/workers --module nodenext --moduleResolution nodenext --target es2022 --esModuleInterop --skipLibCheck --declaration false

# Start the dev server with tsx
npm run dev