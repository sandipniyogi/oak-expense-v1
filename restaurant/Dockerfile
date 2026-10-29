FROM node:24-alpine
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json server.mjs ./
COPY public ./public
COPY scripts ./scripts
COPY test ./test
RUN npm run check && npm test && mkdir -p /data && chown node:node /data
ENV NODE_ENV=production DATA_DIR=/data PORT=3080
USER node
EXPOSE 3080
CMD ["node", "server.mjs"]
