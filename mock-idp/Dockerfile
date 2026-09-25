FROM node:22-alpine
WORKDIR /mock-idp
COPY package.json server.js users.json ./
USER node
EXPOSE 4000
CMD ["node", "server.js"]
