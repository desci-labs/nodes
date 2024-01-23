FROM node:18.19.0

VOLUME /root/.yarn

RUN npm install -g npm@8.10.0

RUN mkdir /app
WORKDIR /app

COPY . .

RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install
RUN npm i -g npm-run-all
RUN yarn build

# server api
EXPOSE 5484

# websocket
EXPOSE 5445

CMD [ "yarn", "start" ]