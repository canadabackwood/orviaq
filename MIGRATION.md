# Orvia 2.0.2 — Stable Next.js / React Transition

Orvia now runs as one application process. The presentation layer is Next.js 16 + React 19, while the existing Node/HTTP engine continues to own the API, intelligence, automation, OAuth and publishing systems.

## Architecture

- One Node process owns the public application.
- Next.js renders the React application and serves static assets.
- The existing Orvia API handler remains mounted at `/api/*` inside the same HTTP server.
- OAuth callbacks remain public on the same origin and are handled by the existing provider modules.
- No development launcher or second public service is required.

## Local

```text
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production

Hostinger should use exactly:

```text
Build command: npm run build
Start command: npm start
```

The application listens on the `PORT` supplied by the hosting platform. Do not configure a second frontend/backend process.

Set the public origin explicitly in production:

```text
ORVIA_PUBLIC_URL=https://your-domain.example
```

If provider-specific redirect variables are present, they must exactly match that public origin, for example:

```text
https://your-domain.example/api/publishing/youtube/callback
https://your-domain.example/api/publishing/meta/callback
https://your-domain.example/api/publishing/tiktok/callback
https://your-domain.example/api/publishing/linkedin/callback
https://your-domain.example/api/publishing/threads/callback
https://your-domain.example/api/publishing/pinterest/callback
https://your-domain.example/api/publishing/x/connect
```

## Why this transition is stable

The migration does not rewrite the working Orvia machine. It changes the application shell and runtime boundary while preserving the existing API contracts and provider modules. Development and production now use the same single-process architecture, with Next.js switching between development and production mode automatically.
