#!/bin/bash
# run-dev-with-worker.sh
# Start both API server and worker process for local development

echo "🚀 Starting Impact Bridge with workers..."
echo ""
echo "This script will start:"
echo "  1. API Server (port 5000)"
echo "  2. BullMQ Workers (Redis)"
echo ""
echo "Press Ctrl+C to stop both processes."
echo ""

# Start API in background
echo "📡 Starting API server..."
npm run dev &
API_PID=$!

# Wait a bit for API to start
sleep 3

# Start worker
echo "⚙️  Starting BullMQ worker..."
npm run worker &
WORKER_PID=$!

# Wait for both to complete
wait $API_PID $WORKER_PID

# Cleanup on exit
trap "kill $API_PID $WORKER_PID 2>/dev/null" EXIT
