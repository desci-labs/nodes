FROM node:16.20.0-bookworm

VOLUME /root/.yarn

RUN npm install -g npm@9.8.1

RUN mkdir /app
WORKDIR /app
RUN mkdir /app/repo-tmp
RUN mkdir -p /app/desci-repo/repo-tmp

COPY . .

RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install
RUN yarn build

# server api
EXPOSE 5484

# websocket
EXPOSE 5445

CMD [ "yarn", "start" ]