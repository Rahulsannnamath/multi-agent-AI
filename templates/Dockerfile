FROM node:20-alpine AS client
WORKDIR /client
COPY client/package*.json ./
# Remove package-lock.json (LLM-generated locks cause conflicts)
RUN rm -f package-lock.json
# Use --legacy-peer-deps to tolerate imprecise version specs from LLM
RUN npm install --legacy-peer-deps --loglevel=warn 2>&1 || \
    (echo "--- Retrying with forced resolution ---" && npm install --force --loglevel=warn 2>&1)
COPY client/ .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN rm -f package-lock.json
RUN npm install --omit=dev --legacy-peer-deps --loglevel=warn 2>&1 || \
    (echo "--- Retrying with forced resolution ---" && npm install --omit=dev --force --loglevel=warn 2>&1)
COPY server/ .
COPY --from=client /client/dist ./public
EXPOSE 5000
CMD ["sh", "-c", "node seed.js && node index.js"]
