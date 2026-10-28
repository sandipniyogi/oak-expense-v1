FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY src ./src
RUN mkdir -p /app/uploads /app/reports
RUN node --check src/index.js && node --check src/automation-bridge.mjs && node src/automation-tests.cjs
EXPOSE 4000
CMD ["npm", "start"]
