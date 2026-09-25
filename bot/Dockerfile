FROM node:22-alpine
WORKDIR /bot
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
USER node
CMD ["node", "src/bot.js"]
