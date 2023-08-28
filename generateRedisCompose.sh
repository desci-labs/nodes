#!/bin/bash

# Script to generate docker-compose.redis.yml file based on redis related .envs

source .env

redis_services=""
cluster_command=""
depends_on=""

# Header
echo "version: '3'" > docker-compose.redis.yml

# Check if Redis should be in cluster mode
if [ "$REDIS_MODE" = "cluster" ]; then

  # Create header for cluster mode
  echo "x-redis-node: &redis-node" >> docker-compose.redis.yml
  echo "  image: \"redis:7-alpine\"" >> docker-compose.redis.yml
  echo "  networks:" >> docker-compose.redis.yml
  echo "    - redis-cluster-compose" >> docker-compose.redis.yml
  echo "  volumes:" >> docker-compose.redis.yml
  echo "    - ./redis/redis.conf:/redis/redis.conf" >> docker-compose.redis.yml
  echo "  command: sh -c 'mkdir -p /redis && redis-server /redis/redis.conf --port \$\$PORT --requirepass \$\$REDIS_PASSWORD'" >> docker-compose.redis.yml
  echo "services:" >> docker-compose.redis.yml

  redis_nodes=${REDIS_CLUSTER_NODES:-3}
  redis_replicas=${REDIS_CLUSTER_REPLICA_NODES:-0}
  start_port=${REDIS_CLUSTER_START_PORT:-7000}

  # Create Redis master nodes dynamically for cluster
  for ((i=0; i<$redis_nodes; i++)); do
    port=$((start_port + i))
    service_name="redis-node-$((i + 1))"
    redis_services+="  $service_name:
    <<: *redis-node
    ports:
      - '$port:$port'
    hostname: $service_name
    environment:
      - PORT=$port
      - REDIS_PASSWORD=$REDIS_PASSWORD
"
    cluster_command+="$service_name:$port "
    depends_on+="        - $service_name
"
  done

# Create Redis replica nodes dynamically for cluster
for ((i=0; i<$redis_nodes; i++)); do
  for ((j=0; j<$redis_replicas; j++)); do
    port=$((start_port + redis_nodes + i * redis_replicas + j))
    service_name="redis-replica-$((i + 1))-$((j + 1))"
    redis_services+="  $service_name:
    <<: *redis-node
    ports:
      - '$port:$port'
    hostname: $service_name
    environment:
      - PORT=$port
      - REDIS_PASSWORD=$REDIS_PASSWORD
"
    depends_on+="        - $service_name
"
  done
done


  redis_services+="  redis-cluster-creator:
      image: redis:latest
      networks:
        - redis-cluster-compose
      command: redis-cli -p $start_port --cluster create $cluster_command --cluster-replicas $redis_replicas --cluster-yes
      depends_on:
$depends_on
"

else
  # Create single Redis node if cluster mode disabled
  echo "services:" >> docker-compose.redis.yml
  redis_services+="  redis:
    image: \"redis:7-alpine\"
    container_name: \"redis_cache\"
    ports:
      - '6379:6379'
    volumes:
      - ./local-data/redis:/data
    environment:
      - REDIS_PASSWORD=$REDIS_PASSWORD
    command: redis-server --requirepass \$\$REDIS_PASSWORD
"
fi

# Append Redis services to docker-compose.redis.yml
echo "$redis_services" >> docker-compose.redis.yml

# Add networks section
echo "networks:" >> docker-compose.redis.yml
echo "  redis-cluster-compose:" >> docker-compose.redis.yml
echo "    driver: bridge" >> docker-compose.redis.yml
