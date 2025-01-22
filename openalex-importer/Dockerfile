FROM node:20.18.1-bullseye-slim

RUN mkdir /app
WORKDIR /app

COPY . .

RUN npm ci
RUN npm run build

CMD [ "npm", "start" ]
