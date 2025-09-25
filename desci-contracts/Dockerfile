FROM node:18.16.0-bookworm
WORKDIR /app

VOLUME /data
VOLUME /app/.openzeppelin

COPY ["package.json", "yarn.lock*", "./"]
RUN yarn --production false
RUN echo "Checking libc version: $(ldd --version | head -n1)"
RUN apt-get update && apt-get -qy install jq postgresql-client dumb-init

COPY . .
EXPOSE 8545

CMD [ "dumb-init", "scripts/startTestChain.sh" ]
