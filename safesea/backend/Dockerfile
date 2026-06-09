FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
ENV NODE_ENV=production
ENV PORT=4000
ENV DB_DIR=/app/db
EXPOSE 4000
CMD ["node", "src/index.js"]
