FROM node:20.19.5-bullseye-slim

VOLUME /root/.yarn

RUN apt-get -qy update && apt-get -qy install openssl curl socat jq

RUN mkdir /app && chown -R node:node /app && chown -R node:node /root && mkdir -p /root/.yarn/v6

WORKDIR /app

COPY --chown=node:node ./package.json ./yarn.lock ./

# Remove ignore-engines flag after bump to node 20, composedb CLI blocks installing meanwhile
RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install --ignore-engines

COPY ./prisma ./prisma
RUN chown -R node /app/node_modules/.prisma \
  && chown -R node /root/.cache/prisma/master \
  && npx prisma generate

# Source code
COPY --chown=node:node ./src ./src
COPY --chown=node:node ./scripts ./scripts
COPY --chown=node:node ./test ./test
COPY --chown=node:node ./vitest.config.ts ./vitest.config.ts
COPY --chown=node:node ./tsconfig.json ./tsconfig.json

# server, debugger, prisma studio
EXPOSE 5420 9227 5555

CMD [ "yarn", "dev" ]
