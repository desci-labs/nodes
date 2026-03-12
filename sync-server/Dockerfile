# Use the official Node.js 10 image.
# https://hub.docker.com/_/node
FROM node:20

# Create and change to the app directory.
WORKDIR /usr/src/app

# Copy application dependency manifests to the container image.
# Copying package.json and yarn.lock separately prevents re-running yarn install on every code change.
COPY package.json yarn.lock ./

# Install production dependencies.
RUN yarn install --frozen-lockfile

# Wrangler will prompt, and thus hang if you don't specify this
ENV WRANGLER_SEND_METRICS=false
# Run the web service on container startup.
CMD [ "yarn", "dev" ]