FROM node:20.18.1-bullseye-slim

RUN apt-get update && apt-get install -y \
    jq \
    postgresql-client \
    socat \
    curl \
    vim \
    bash \
    procps

RUN mkdir /app
WORKDIR /app

COPY . .

RUN npm ci
RUN npm run build

CMD [ "npm", "start" ]
