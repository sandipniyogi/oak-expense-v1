FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-noto-cjk \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
RUN mkdir -p /app/storage/assets /app/storage/thumbs /app/storage/renders /app/storage/exports /app/storage/tmp
EXPOSE 4500
CMD ["npm", "start"]
