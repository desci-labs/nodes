FROM node:18.17.0

VOLUME /root/.yarn

RUN apt-get -qy update && apt-get -qy install openssl firefox-esr libasound2

# Install Chrome/Chromium and its dependencies for Puppeteer
RUN apt-get -qy update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-font-awesome \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils

RUN apt-get -qy update && apt-get install -y    inkscape 
RUN apt-get -qy update && apt-get install -y    texlive-full  --fix-missing
RUN apt-get -qy update && apt-get install -y     texlive-xetex 
RUN apt-get -qy update && apt-get install -y    unzip \
    curl

RUN apt-get update && apt-get install imagemagick

# update imagemagick security policy to allow pdf
RUN sed '/"PDF"/d' /etc/ImageMagick-6/policy.xml > /etc/ImageMagick-6/policy.xml

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium

RUN npm install -g npm@8.10.0

RUN mkdir /app
WORKDIR /app

COPY . .

RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install
RUN yarn build

# server api
EXPOSE 5454

CMD [ "yarn", "start" ]
