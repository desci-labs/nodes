FROM node:18.17.0

VOLUME /root/.yarn

RUN apt-get -qy update && apt-get -qy install openssl firefox-esr libasound2

RUN apt-get -qy update && apt-get install -y \
    fonts-font-awesome 
RUN apt-get -qy update && apt-get install -y    inkscape 
RUN apt-get -qy update && apt-get install -y    texlive-full  --fix-missing
RUN apt-get -qy update && apt-get install -y     texlive-xetex 
RUN apt-get -qy update && apt-get install -y    unzip \
    curl

RUN apt-get update && apt-get install imagemagick

# update imagemagick security policy to allow pdf
RUN sed '/"PDF"/d' /etc/ImageMagick-6/policy.xml > /etc/ImageMagick-6/policy.xml

RUN npm install -g npm@10.2.5

RUN mkdir /app
WORKDIR /app

COPY . .

RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install
RUN yarn build

# server api
EXPOSE 5454

CMD [ "yarn", "start" ]