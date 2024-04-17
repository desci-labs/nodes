FROM node:20.12.1-alpine3.18 AS base

RUN apk update && apk add --no-cache dumb-init bash

WORKDIR /usr/src/app

COPY package*.json .

####################
FROM base as builder

RUN --mount=type=cache,target=/usr/src/app/.npm \
  npm set cache /usr/src/app/.npm && \
  npm ci

COPY . .

RUN npm run build

#######################
FROM base AS production

RUN --mount=type=cache,target=/usr/src/app/.npm \
  npm set cache /usr/src/app/.npm && \
  npm ci --only=production

ENV NODE_ENV production
USER node

COPY --chown=node:node --from=builder /usr/src/app/dist ./dist

EXPOSE 5678

CMD [ "dumb-init", "node", "dist/index.js"]
