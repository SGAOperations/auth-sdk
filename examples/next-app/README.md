# SGAuth Next.js example

A minimal Next 16 App Router app that uses `@nusgaops/sgauth`. It demonstrates:

- `/` is public and links to sign-in.
- `/protected` calls `requireSession()` and shows the user and their positions.
- `/finance` has an "Approve purchase" Server Action that checks `hasPosition(session, "vp-finance")` on the server. The position key that gates the action is `vp-finance`; a user without it is refused.
- The header has a logout link, built with `logoutUrl()`, shown when signed in.

The package [README](../../README.md) explains each piece.

## Run it

Build the package first, because the example installs it from the repository root (`file:../..`):

```bash
npm ci               # in the repo root
npm run build        # in the repo root, so dist/ exists
cd examples/next-app
npm install
cp .env.example .env.local
```

The values in `.env.example` target dev SGAuth. Pick one of the two setups below.

### Against local SGAuth

Run SGAuth from `SGAOperations/auth` with `SGAUTH_ENV=local`; it listens on `http://auth.sga.localhost:3000`. Then, in `.env.local`, switch to the commented local values (`SGAUTH_URL=http://auth.sga.localhost:3000`, `SGAUTH_COOKIE_NAME=sgauth-local.session_token`) and serve the example on a sibling `sga.localhost` host:

```bash
npm run dev -- --hostname example.sga.localhost --port 3001
```

Open `http://example.sga.localhost:3001`. The local session cookie has `Domain=sga.localhost`, so it reaches this app. Chrome and Edge resolve `*.localhost` natively; Firefox and Safari need the extra setup described in the [Dev and preview environments](../../README.md#dev-and-preview-environments) section of the package README.

### Against dev SGAuth

Dev SGAuth sets a `northeasternsga.com` cookie, so the app must be served from a `*.northeasternsga.com` host over HTTPS. Use a stable branch domain such as `<product>-dev.northeasternsga.com` on a deployment, or a local hostname under that domain with HTTPS:

```bash
npm run dev -- --experimental-https
```

The app's origin must also be an active row in the dev product registry, or SGAuth will not send the user back to it. Keep the `.env.example` values as they are.

## What you should see

1. An unauthenticated visit to `/protected` redirects to SGAuth sign-in.
2. After signing in you land back on `/protected`, which shows your email.
3. On `/finance`, "Approve purchase" is refused unless your account holds `vp-finance`.
4. "Log out" signs you out again.

This directory is not part of the published package.
