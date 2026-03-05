FROM node:25-slim AS build
WORKDIR /app
ARG VITE_SERVER_URL=http://localhost:5001
ENV VITE_SERVER_URL=$VITE_SERVER_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1-alpine-slim
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
