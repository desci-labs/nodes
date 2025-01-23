# Use the official Node.js 10 image.
# https://hub.docker.com/_/node
FROM node:18

# Create and change to the app directory.
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
# A wildcard is used to ensure both package.json AND package-lock.json are copied.
# Copying this separately prevents re-running npm install on every code change.
COPY package*.json ./

# Install production dependencies.
RUN yarn install

# Wrangler will prompt, and thus hang if you don't specify this
ENV WRANGLER_SEND_METRICS=false
# Run the web service on container startup.
CMD [ "yarn", "dev" ]