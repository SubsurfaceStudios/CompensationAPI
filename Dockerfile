FROM node:24-alpine
WORKDIR /var/lib/cvr

# dependencies
COPY package.json ./
COPY package-lock.json ./
RUN npm install --no-save

# source
COPY routers ./routers
COPY index.js ./index.js
COPY helpers.js ./helpers.js
COPY middleware.js ./middleware.js

# data / config
COPY data ./data
COPY keys ./keys
COPY config.jsonc ./

# set up app user
RUN adduser -D -g "" cvr
RUN chown cvr ./data/audit.json
USER cvr

# set command
EXPOSE 8080
CMD ["node", "."]