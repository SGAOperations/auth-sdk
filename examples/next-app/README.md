# SGAuth Next.js example

A minimal Next 16 App Router app that uses `@nusgaops/sgauth`:

- `/` is public and links to sign-in.
- `/protected` calls `requireSession()` and shows the user and their positions.
- `/finance` has an "Approve purchase" Server Action that checks `hasPosition(session, "vp-finance")` on the server.
- The header has a logout link, shown when signed in.

## Run it

SGAuth's session cookie is `__Secure-`, which browsers only send over HTTPS, so plain `localhost` always looks signed out. Serve the app on a local `*.northeasternsga.com` hostname over HTTPS (AUTH-T34) and point it at SGAuth dev:

```bash
npm install            # in the repo root, then:
npm run build          # in the repo root, so dist/ exists
cd examples/next-app
npm install
cp .env.example .env.local
npm run dev -- --experimental-https
```

Then open the app on your local hostname. Edit `.env.local` if your SGAuth deployment or cookie name differs.

This directory is not part of the published package.
