FROM node:16.14.2

VOLUME /root/.yarn

RUN apt-get -qy update && apt-get -qy install openssl

RUN npm install -g npm@8.10.0

RUN mkdir /app
RUN chown -R node:node /app
RUN chown -R node:node /root
RUN mkdir -p /tmp/ipfs/src
RUN mkdir -p /tmp/ipfs/ipfs
RUN chown -R node:node /tmp/ipfs
RUN mkdir -p /root/.yarn/v6

WORKDIR /app

COPY --chown=node:node ./desci-server/package.json .
COPY --chown=node:node ./desci-server/yarn.lock .

COPY --chown=node:node ./desci-server ./
# ensure desci-models symlink
COPY --chown=node:node ./desci-server/package.json .

RUN rm -r ./desci-models
RUN mkdir ./desci-models
COPY --chown=node:node ./desci-models ./desci-models
WORKDIR /app/desci-models
RUN yarn
RUN yarn build
WORKDIR /app

# copy contract config
RUN rm -r ./src/desci-contracts-config
RUN mkdir ./src/desci-contracts-config
COPY --chown=node:node ./desci-contracts/.openzeppelin ./src/desci-contracts-config

# copy contract abis
RUN rm -r ./src/desci-contracts-artifacts
RUN mkdir ./src/desci-contracts-artifacts
COPY --chown=node:node ./desci-contracts/artifacts ./src/desci-contracts-artifacts

RUN mv package.json package.json.old
RUN sed 's/link:/file:/' package.json.old > package.json

RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install

RUN chown -R node /app/node_modules/.prisma
RUN chown -R node /root/.cache/prisma/master

RUN npx prisma generate

RUN yarn build

# server api
EXPOSE 5420

# prisma studio
EXPOSE 5555

CMD [ "yarn", "start" ]