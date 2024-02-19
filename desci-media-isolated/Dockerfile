
FROM docker.io/node:20.9.0-alpine as base

# Install dumb-init so we can use it as PID 1
RUN apk update && apk add --no-cache dumb-init

# No longer using libre office file preview remove soon
# ARG APP_ROOT=/opt/app-root/src
# ENV NO_UPDATE_NOTIFIER=true \
#   PATH="/usr/lib/libreoffice/program:${PATH}" \
#   PYTHONUNBUFFERED=1
# WORKDIR ${APP_ROOT}

# # Install LibreOffice & Common Fonts
# RUN apk --no-cache add bash libreoffice util-linux \
#   font-droid-nonlatin font-droid ttf-dejavu ttf-freefont ttf-liberation && \
#   rm -rf /var/cache/apk/*

# # Install Microsoft Core Fonts
# RUN apk --no-cache add msttcorefonts-installer fontconfig && \
#   update-ms-fonts && \
#   fc-cache -f && \
#   rm -rf /var/cache/apk/*

# # Fix Python/LibreOffice Integration
# COPY container/libreOffice ${APP_ROOT}/container/libreOffice
# RUN chmod a+rx ${APP_ROOT}/container/libreOffice/bindPython.sh \
#   && ${APP_ROOT}/container/libreOffice/bindPython.sh

# NPM Permission Fix
RUN mkdir -p /.npm
RUN chown -R 1001:0 /.npm

# App Setup
WORKDIR /usr/src/app

COPY package*.json ./

FROM base as dev

RUN --mount=type=cache,target=/usr/src/app/.npm \
  npm set cache /usr/src/app/.npm && \
  npm install

COPY . .

CMD ["dumb-init", "npx", "ts-node-dev", "--respawn", "--transpile-only", "src/index.ts"]

FROM base as production

ENV NODE_ENV production

# Cache mounts for faster builds, prod env for better express perf
RUN --mount=type=cache,target=/usr/src/app/.npm \
  npm set cache /usr/src/app/.npm && \
  npm ci --only=production


# 'node' user is created by the node image, prevent perm issues, run with reduced privs
USER node
COPY --chown=node:node ./src/ .
RUN npm run build


CMD ["dumb-init", "node", "dist/index.js"]
