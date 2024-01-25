FROM node:16.20.0-bookworm

VOLUME /root/.yarn

RUN npm install -g npm@8.10.0

RUN mkdir /app
WORKDIR /app
RUN mkdir /app/desci-repo/repo-tmp
RUN mkdir /app/repo-tmp

COPY . .

RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install
RUN yarn build

# server api
EXPOSE 5484

# websocket
EXPOSE 5445

CMD [ "yarn", "start" ]