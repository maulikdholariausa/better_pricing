FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node server.js ./
COPY --chown=node:node backend ./backend
COPY --chown=node:node content ./content
COPY --chown=node:node dist ./dist
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8000 DATA_DIR=/data
EXPOSE 8000
CMD ["node", "server.js"]
