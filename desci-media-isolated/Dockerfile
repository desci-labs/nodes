
FROM docker.io/node:20.9.0 as base

# Install dumb-init so we can use it as PID 1
# RUN apk update && apk add --no-cache dumb-init
# RUN apk add --no-cache unoconv ffmpeg imagemagick curl

RUN apt-get update && apt-get install -y dumb-init ghostscript unoconv ffmpeg imagemagick curl && \
    rm -rf /var/lib/apt/lists/*

# Modify ImageMagick policy to allow PDF processing
RUN sed -i '/<policy domain="coder" rights="none" pattern="PDF" \/>/c\<policy domain="Undefined" rights="read|write" pattern="PDF" \/>' /etc/ImageMagick-6/policy.xml

# NPM Permission Fix
RUN mkdir -p /.npm
RUN chown -R 1001:0 /.npm

# App Setup
WORKDIR /usr/src/app

COPY package*.json .
COPY tsconfig.json .
COPY .eslintrc.json .
COPY ./src .
COPY . .
RUN npm i
RUN npm run build
RUN chown -R node:node .

EXPOSE 7771

FROM base as dev

RUN --mount=type=cache,target=/usr/src/app/.npm \
  npm set cache /usr/src/app/.npm && \
  npm install

COPY . .

# Expose debugger port
EXPOSE 9777

CMD ["dumb-init", "npm", "run", "dev"]

FROM base as production
# Cache mounts for faster builds, prod env for better express perf
ENV NODE_ENV production
COPY --from=base /usr/src/app/dist ./dist

# 'node' user is created by the node image, prevent perm issues, run with reduced privs
USER node



CMD ["dumb-init", "node", "dist/index.js"]
