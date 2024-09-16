FROM node:20.8.1-bullseye-slim

VOLUME /root/.yarn

RUN npm install -g npm@10.8.2

RUN mkdir /app
WORKDIR /app

COPY . .

RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install
RUN yarn build

CMD [ "yarn", "start" ]
