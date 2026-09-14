# ---- EthioHire React frontend (build from the frontend/ directory) ----
# Build:  docker build -t ethiohire-frontend ./frontend
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json ./
COPY bun.lock* ./
RUN npm install --silent
COPY . .
ARG VITE_SIGNALING_URL=/signal
ENV VITE_SIGNALING_URL=$VITE_SIGNALING_URL
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
