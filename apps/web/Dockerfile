FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .

# NEXT_PUBLIC_* variables are embedded into the browser bundle at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_APP_ENV=production
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_APP_ENV=${NEXT_PUBLIC_APP_ENV}

RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
