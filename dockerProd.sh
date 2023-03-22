#!/bin/bash

# this mimics the procedure used to build/run server on production
# this won't start other services, if you want to test with other services make sure dockerDev.sh is running them
# --> except for conflicting server container

docker build .

TARGET=$(docker images | awk '{print $3}' | head -n 2 | tail -n 1)
docker run -p "5420:5420" --env-file=.env $TARGET