FROM node:18-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine

# Generate a self-signed TLS certificate for development/default.
# In production, mount real certificates or use a cert manager.
RUN apk add --no-cache openssl \
    && mkdir -p /etc/nginx/ssl \
    && openssl req -x509 -nodes -days 365 \
       -newkey rsa:2048 \
       -keyout /etc/nginx/ssl/selfsigned.key \
       -out /etc/nginx/ssl/selfsigned.crt \
       -subj "/CN=localhost" \
    && apk del openssl

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
