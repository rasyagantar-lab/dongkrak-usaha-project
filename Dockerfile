# DongkrakUsaha AI Marketing Suite -- Cloud Run image.
#
# DO NOT MODIFY THIS REPOSITORY TO DEPLOY IT. It is already deploy-ready. The only
# things that live outside the repo are environment variables (see DEPLOY_CLOUD_RUN.md).
#
# Debian-based image on purpose: `sharp` ships prebuilt glibc binaries; Alpine (musl)
# would need a different build. Node 22 LTS.

# ---- build stage: needs devDependencies (vite, esbuild, tailwind, typescript) ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
# playwright-chromium is a runtime dependency of this project but its ~150MB browser
# download is not needed to build or serve the app.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage: production dependencies only ----
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# Built frontend + bundled server.
COPY --from=build /app/dist ./dist
# Read at runtime: agent contracts (prepended to every prompt) and the extension source
# (zipped on startup for the download button).
COPY ai-agents ./ai-agents
COPY public/extension ./public/extension
# Bundled caption font: captions are rendered as vector paths from this file, so the
# image needs no system fonts at all.
COPY server/fonts ./server/fonts
# Cloud Run injects PORT; the server reads it (defaults to 3000 locally).
EXPOSE 8080
CMD ["node", "dist/server.cjs"]
