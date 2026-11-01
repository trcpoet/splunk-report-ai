# syntax=docker/dockerfile:1
# The SplunkEvents web app, plus a "tools" image for the seed script and the
# sync worker. docker-compose.yml wires them up with MongoDB; see docs/docker.md.
# The "worker" image runs the same scripts as a non-root user, for Kubernetes
# (deploy/helm, docs/kubernetes.md).

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
# OpenShift runs containers as a random user in group 0, so the group gets the
# owner's rights on what the app image copies: Next writes its cache in .next.
RUN npm run build && chmod -R g=u .next/standalone .next/static public

# The connector (worker/sync.ts) and the demo-users seed, for Kubernetes: the
# tools image, run as a non-root user. docker-compose.yml uses tools itself.
FROM tools AS worker
ENV HOME=/tmp
USER 1000
CMD ["node", "--import", "tsx", "worker/sync.ts"]

# The app: Next's standalone server and only the files it needs.
FROM node:24-slim AS app
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=1000:0 /app/.next/standalone ./
COPY --from=build --chown=1000:0 /app/.next/static ./.next/static
COPY --from=build --chown=1000:0 /app/public ./public
# The node user, by number, so Kubernetes can check it isn't root (runAsNonRoot).
USER 1000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=10 \
    CMD node -e "fetch('http://localhost:3000/login').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
