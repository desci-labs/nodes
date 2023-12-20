FROM node:18.17.0-bookworm
WORKDIR /app

VOLUME /data
VOLUME /app/.openzeppelin

COPY ["package.json", "yarn.lock*", "./"]
RUN yarn config set registry https://registry.npmjs.org
RUN yarn --production false
RUN echo "Checking libc version: $(ldd --version | head -n1)"
RUN apt-get update && apt-get -qy install jq postgresql-client

COPY . .
EXPOSE 8545

CMD [ "scripts/startTestChain.sh" ]