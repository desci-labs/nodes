
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

COPY package*.json ./

FROM base as dev

RUN --mount=type=cache,target=/usr/src/app/.npm \
  npm set cache /usr/src/app/.npm && \
  npm install


COPY . .

# Auto create .env from .env.example if it doesn't exist
RUN if [ ! -f .env ]; then cp .env.example .env; fi

# Expose debugger port
EXPOSE 9777

CMD ["dumb-init", "npx", "tsx","watch", "--inspect=0.0.0.0:9777", "src/index.ts"]

FROM base as production
# Cache mounts for faster builds, prod env for better express perf
ENV NODE_ENV production
RUN --mount=type=cache,target=/usr/src/app/.npm \
  npm set cache /usr/src/app/.npm && \
  npm ci --only=production


# 'node' user is created by the node image, prevent perm issues, run with reduced privs
USER node
COPY --chown=node:node ./src/ .
RUN npm run build


CMD ["dumb-init", "node", "dist/index.js"]
