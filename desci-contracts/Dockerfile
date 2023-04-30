FROM node:16.16.0
WORKDIR /app

VOLUME /data
VOLUME /app/.openzeppelin

COPY ["package.json", "yarn.lock*", "./"]
RUN yarn --production false
RUN apt-get update && apt-get -qy install jq
COPY . .
EXPOSE 8545

CMD [ "scripts/startTestChain.sh" ]