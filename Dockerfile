FROM ghcr.io/puppeteer/puppeteer:22

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

CMD ["node", "server.js"]
