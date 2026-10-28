FROM node:20-alpine
WORKDIR /app
COPY server.js .
COPY public ./public
COPY test-save.cjs .
RUN node --check server.js && node --check public/app.js && node test-save.cjs
RUN base64 -d public/icon-192.b64 > public/icon-192.png && base64 -d public/icon-512.b64 > public/icon-512.png
EXPOSE 3443
CMD ["node", "server.js"]
