#!/usr/bin/env bash

################################################################################
# RDS Database Tunnel Script
#
# Creates a secure tunnel to AWS RDS databases through Kubernetes pods.
# This script launches an ephemeral socat pod in the K8s cluster to proxy
# connections to RDS instances that are not directly accessible locally.
#
# USAGE:
#   ./rds-tunnel.sh <env> <local_port>
#
# ARGUMENTS:
#   env         - Environment to connect to: 'dev' or 'prod'
#   local_port  - Local port to bind to (e.g., 5432, 5433, etc.)
#
# EXAMPLES:
#   ./rds-tunnel.sh dev 5432    # Connect to dev DB on standard PostgreSQL port
#   ./rds-tunnel.sh dev 5433    # Connect to dev DB on alternate port
#   ./rds-tunnel.sh prod 5434   # Connect to production DB on port 5434
#
# CONNECT WITH:
#   After running this script, connect your database client to:
#   Host: localhost
#   Port: <local_port>
#   Database/User/Password: RDS credentials
#
# CLEANUP:
#   Press Ctrl+C to close the tunnel. The script will automatically:
#   - Stop the port-forward process
#   - Delete the Kubernetes pod
################################################################################

# Parse arguments
ENV="${1}"
LOCAL_PORT="${2}"

# Validate arguments
if [ -z "$ENV" ] || [ -z "$LOCAL_PORT" ]; then
    echo "Usage: $0 <env> <local_port>"
    echo "  env: dev or prod"
    echo "  local_port: local port to bind to (e.g., 5432)"
    echo ""
    echo "Example: $0 dev 5433"
    exit 1
fi

# Set RDS endpoint based on environment
case "$ENV" in
    dev)
        RDS_ENDPOINT="nodes-dev-restored-02-19-cluster.cluster-ctzyam40vcxa.us-east-2.rds.amazonaws.com"
        ;;
    prod)
        # Update this with the actual production RDS endpoint
        RDS_ENDPOINT="desci-db-prod.cluster-ctzyam40vcxa.us-east-2.rds.amazonaws.com"
        ;;
    *)
        echo "Error: Environment must be 'dev' or 'prod'"
        exit 1
        ;;
esac

RDS_PORT="5432"
POD_NAME="db-tunnel-${ENV}-$$"  # Use environment and PID to make pod name unique

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to cleanup on exit
cleanup() {
    echo -e "\n${RED}Shutting down tunnel...${NC}"
    
    # Kill the port-forward if it's running
    if [ -n "$PORT_FORWARD_PID" ]; then
        kill $PORT_FORWARD_PID 2>/dev/null
    fi
    
    # Delete the pod if it exists
    kubectl delete pod "$POD_NAME" --force --grace-period=0 2>/dev/null
    
    echo -e "${GREEN}Tunnel closed${NC}"
    exit 0
}

# Set trap for cleanup on CTRL+C and exit
trap cleanup INT TERM

echo -e "${GREEN}Starting ${ENV} RDS tunnel${NC}"
echo -e "  Remote: $RDS_ENDPOINT:$RDS_PORT"
echo -e "  Local:  localhost:$LOCAL_PORT"

# Start the socat pod in background
echo "Creating tunnel pod..."
kubectl run "$POD_NAME" \
    --image=alpine/socat \
    --restart=Never \
    --pod-running-timeout=30s \
    -- tcp-listen:$RDS_PORT,fork,reuseaddr tcp-connect:$RDS_ENDPOINT:$RDS_PORT &
sleep 2

# Wait for pod to be ready
echo "Waiting for pod to be ready..."

if ! kubectl wait --for=condition=Ready pod/"$POD_NAME" --timeout=30s; then
    echo -e "${RED}Failed to start tunnel pod${NC}"
    exit 1
fi

# Start port-forward
echo "Starting port-forward..."
kubectl port-forward pod/"$POD_NAME" "$LOCAL_PORT":$RDS_PORT &
PORT_FORWARD_PID=$!

# Wait a moment for port-forward to establish
sleep 2

# Check if port-forward is running
if kill -0 $PORT_FORWARD_PID 2>/dev/null; then
    echo -e "${GREEN}✓ Tunnel established!${NC}"
    echo -e "${GREEN}Connect to: localhost:$LOCAL_PORT${NC}"
    echo -e "\nPress Ctrl+C to close tunnel..."
    
    # Wait indefinitely (until interrupted)
    wait $PORT_FORWARD_PID
else
    echo -e "${RED}Failed to establish port-forward${NC}"
    exit 1
fi
