
FROM docker.io/node:20.9.0 as base

# Install dumb-init so we can use it as PID 1

RUN apt-get update && apt-get install -y dumb-init ghostscript unoconv ffmpeg imagemagick graphicsmagick curl && \
    rm -rf /var/lib/apt/lists/*

# Modify ImageMagick policy to allow PDF processing
RUN sed -i '/<policy domain="coder" rights="none" pattern="PDF" \/>/c\<policy domain="Undefined" rights="read|write" pattern="PDF" \/>' /etc/ImageMagick-6/policy.xml


# App Setup
WORKDIR /usr/src/app

COPY tsconfig.json .
COPY package*.json ./

FROM base as dev

RUN --mount=type=cache,target=/usr/src/app/.npm \
  npm set cache /usr/src/app/.npm && \
  npm install


COPY . .


# Expose debugger port
EXPOSE 9777

ENTRYPOINT ["/usr/src/app/scripts/containerInitDev.sh"]
CMD ["dumb-init", "npx", "tsx","watch", "--clear-screen=false", "--env-file=.env", "--inspect=0.0.0.0:9777", "src/index.ts"]

FROM base as production
# Cache mounts for faster builds, prod env for better express perf
RUN --mount=type=cache,target=/usr/src/app/.npm \
  npm set cache /usr/src/app/.npm && \
  npm install

ENV NODE_ENV production
# 'node' user is created by the node image, prevent perm issues, run with reduced privs
RUN mkdir -p /usr/src/app/dist && chown node:node /usr/src/app/dist
USER node
COPY --chown=node:node ./src/ ./src/  
COPY --chown=node:node ./public/ ./public/  
USER root
RUN chown -R node:node /usr/src/app
USER node
RUN npm run build && \
    npm prune --production


COPY --chown=node:node ./scripts/containerInitProd.sh /usr/src/app/scripts/containerInitProd.sh
ENTRYPOINT ["/usr/src/app/scripts/containerInitProd.sh"]
CMD ["dumb-init", "node", "dist/index.js"]
