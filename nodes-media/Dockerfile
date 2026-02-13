FROM ghcr.io/prefix-dev/pixi:latest AS build

RUN pixi -V

FROM docker.io/node:20.9.0 AS base

COPY --from=build --chown=root:root --chmod=0555 /usr/local/bin/pixi /usr/local/bin/pixi
ENV PATH="/root/.pixi/bin:${PATH}"
RUN pixi -V

VOLUME /root/.yarn

# Build args for optional heavy packages (controlled via nodes/.env, check .env.example)
ARG INSTALL_TEXLIVE=true
ARG INSTALL_CHROMIUM=true
ARG INSTALL_INKSCAPE=true

RUN apt-get -qy update && apt-get -qy install openssl firefox-esr libasound2

# Install Chrome/Chromium and its dependencies for Puppeteer
RUN if [ "$INSTALL_CHROMIUM" = "true" ]; then \
    apt-get -qy update && apt-get install -y \
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
    xdg-utils; \
    else echo "Skipping Chromium install (INSTALL_CHROMIUM=false)"; fi

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium

# Inkscape - SVG processing
RUN if [ "$INSTALL_INKSCAPE" = "true" ]; then \
    apt-get -qy update && apt-get install -y inkscape; \
    else echo "Skipping Inkscape install (INSTALL_INKSCAPE=false)"; fi

# TeXLive Full - LaTeX to PDF conversion (~5GB)
RUN if [ "$INSTALL_TEXLIVE" = "true" ]; then \
    apt-get -qy update && apt-get install -y texlive-full --fix-missing && \
    apt-get -qy update && apt-get install -y texlive-latex-recommended && \
    apt-get -qy update && apt-get install -y texlive-xetex && \
    apt-get install -y xzdec && \
    mkdir -p /root/texmf && \
    tlmgr init-usertree && \
    which latexmk; \
    else echo "Skipping TeXLive install (INSTALL_TEXLIVE=false)"; fi

RUN apt-get -qy update && apt-get install -y unzip curl

# install imagemagick
RUN apt-get update && apt-get install -y imagemagick

# update imagemagick security policy to allow pdf
RUN sed -i '/"PDF"/d' /etc/ImageMagick-6/policy.xml

# install ghostscript
RUN apt-get install -y ghostscript

RUN npm install -g npm@8.10.0

RUN mkdir /app
WORKDIR /app

COPY . .

RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install
RUN yarn build

# server api
EXPOSE 5454

CMD [ "yarn", "start" ]
