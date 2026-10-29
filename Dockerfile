# syntax=docker/dockerfile:1
# The SplunkEvents web app, plus a "tools" image for the seed script and the
# sync worker. docker-compose.yml wires them up with MongoDB; see docs/docker.md.

# Packages, from the lockfile.
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Everything, for `npm run seed` and `npm run sync`, which run TypeScript with tsx.
FROM deps AS tools
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# The production build. The sign-in page is built ahead of time, so the demo
# settings it shows are build arguments. The other values are placeholders:
# nothing connects to the database while building (the same as in CI).
FROM tools AS build
ARG DEMO_MODE=true
ARG DEMO_PASSWORD=splunk-demo-2026
ENV NEXT_OUTPUT=standalone \
    DEMO_MODE=$DEMO_MODE \
    DEMO_PASSWORD=$DEMO_PASSWORD \
    MONGODB_URI=mongodb://build-placeholder:27017/splunkevents \
    BETTER_AUTH_SECRET=build-placeholder-not-a-real-secret-000000 \
    BETTER_AUTH_URL=http://localhost:3000
RUN npm run build

# The app: Next's standalone server and only the files it needs.
FROM node:24-slim AS app
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=10 \
    CMD node -e "fetch('http://localhost:3000/login').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
