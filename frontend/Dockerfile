FROM node:18-alpine AS build

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
# Use nginx.k8s.conf for production (static-only, no reverse proxy — Ingress handles routing)
# Use nginx.conf for Docker Compose (reverse proxy to backend)
ARG NGINX_CONF=nginx.conf
COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf

# Ensure nginx worker directories are writable by the nginx user
RUN chown -R nginx:nginx /var/cache/nginx /var/log/nginx \
    && touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
