#!/bin/bash

cd desci-server

echo $PWD
docker-compose --file ../docker-compose.yml --file ../docker-compose.prod.yml --compatibility up --build
