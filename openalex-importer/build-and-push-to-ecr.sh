#! /usr/bin/env bash

# build docker image and push to ECR
set -euxo pipefail

TAGNAME=openalex-importer

docker build -t $TAGNAME .

docker tag $TAGNAME:latest 523044037273.dkr.ecr.us-east-2.amazonaws.com/$TAGNAME:latest

aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 523044037273.dkr.ecr.us-east-2.amazonaws.com
docker push 523044037273.dkr.ecr.us-east-2.amazonaws.com/$TAGNAME:latest
