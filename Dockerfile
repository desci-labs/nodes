FROM node:20.18.1-bullseye-slim

VOLUME /root/.yarn

# Install system dependencies including Chromium for Puppeteer (works on both AMD64 and ARM64)
RUN apt-get -qy update && apt-get -qy install openssl curl socat jq \
    fonts-dejavu \
    fonts-liberation \
    fontconfig \
    python3 \
    make \
    g++ \
    # Chromium and dependencies for Puppeteer (cross-platform)
    chromium \
    libnss3 \
    libxss1 \
    libasound2 \
    libxtst6 \
    libgtk-3-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libatk-bridge2.0-0 \
    && \
    fc-cache -fv && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set Chromium executable path for Puppeteer (works on both architectures)
ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

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
RUN yarn config set registry https://registry.npmjs.org/

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
RUN mkdir -p /app/desci-repo/repo-tmp
RUN mkdir -p /app/desci-server/repo-tmp
COPY --chown=node:node ./desci-contracts/artifacts ./src/desci-contracts-artifacts

RUN mv package.json package.json.old
RUN sed 's/link:/file:/' package.json.old > package.json

# Remove ignore-engines flag after bump to node 20, composedb CLI blocks installing meanwhile
RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install --ignore-engines

# Rebuild Sharp for the correct platform
RUN npm rebuild sharp

RUN chown -R node /app/node_modules/.prisma
RUN chown -R node /root/.cache/prisma/master

RUN npx prisma generate

RUN yarn build

# server api
EXPOSE 5420

EXPOSE 9227

# prisma studio
EXPOSE 5555

CMD [ "yarn", "start" ]
