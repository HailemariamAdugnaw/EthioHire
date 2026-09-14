FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json ./
COPY index.ts ./
RUN bun install --production
EXPOSE 3031
CMD ["bun", "index.ts"]
