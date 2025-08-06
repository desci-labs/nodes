FROM node:20.18.1-bullseye-slim

VOLUME /root/.yarn

# Install system dependencies including Chromium for Puppeteer (works on both AMD64 and ARM64)
# This layer is cached unless system dependencies change
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

# Create directories and set permissions in a single layer for better caching
RUN mkdir /app && \
    chown -R node:node /app && \
    chown -R node:node /root && \
    mkdir -p /tmp/ipfs/src /tmp/ipfs/ipfs && \
    chown -R node:node /tmp/ipfs && \
    mkdir -p /root/.yarn/v6

WORKDIR /app

# Copy desci-models first since it's a dependency that changes less frequently
COPY --chown=node:node ./desci-models ./desci-models
WORKDIR /app/desci-models
RUN yarn config set registry https://registry.npmjs.org/ && \
    yarn install --frozen-lockfile && \
    yarn build

WORKDIR /app

# Copy package files first for better dependency caching
COPY --chown=node:node ./desci-server/package.json ./desci-server/yarn.lock ./

# Install dependencies before copying source code (better cache invalidation)
RUN mv package.json package.json.old && \
    sed 's/link:/file:/' package.json.old > package.json

# Use cache mount and frozen lockfile for faster, deterministic installs
RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install --ignore-engines --frozen-lockfile

# Rebuild Sharp for the correct platform in the same layer
RUN npm rebuild sharp

# Copy contract dependencies
COPY --chown=node:node ./desci-contracts/.openzeppelin ./src/desci-contracts-config
COPY --chown=node:node ./desci-contracts/artifacts ./src/desci-contracts-artifacts

# Create required directories
RUN mkdir -p /app/desci-repo/repo-tmp /app/desci-server/repo-tmp

# Copy source code last (most frequently changing)
COPY --chown=node:node ./desci-server ./

# Set permissions and generate Prisma client
RUN chown -R node /app/node_modules/.prisma && \
    chown -R node /root/.cache/prisma/master

RUN npx prisma generate

# Build the application
RUN yarn build

# server api
EXPOSE 5420

EXPOSE 9227

# prisma studio
EXPOSE 5555

CMD [ "yarn", "start" ]
