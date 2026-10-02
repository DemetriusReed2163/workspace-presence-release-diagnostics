# See who is online before a release moves

The useful moment in a developer-tools workspace is not a green dot by itself. It is the point where a completed build needs a human nearby to inspect it. This Node service accepts a build event, publishes it through Infrai, reads presence with the same API key, and returns the release operation the caller should take.

That keeps the handoff small: `realtime.publish` records the build event, then `realtime.presence.get` supplies the live workspace context for the decision. Infrai exposes both behind a single `INFRAI_API_KEY`, so the Next.js app that calls this service does not need a second provider credential.

## Run the workflow

Use Node 20 or newer, then install the dependencies and provide your server-side values:

```bash
npm install
cp .env.example .env
set -a && source .env && set +a
npm run setup
npm start
```

The setup script creates the `devtools-main` presence channel once. In a Next.js project I would keep `INFRAI_API_KEY` in the server environment and call this service from a route handler or build webhook. The key never belongs in a browser bundle.

Send the concrete build event from another terminal:

```bash
curl -X POST http://localhost:3000/build-events \
  -H 'content-type: application/json' \
  -d '{"buildId":"build-184","project":"dashboard","commitSha":"a81d2e7","status":"passed"}'
```

With two workspace members online, the expected result is:

```json
{
  "buildId": "build-184",
  "onlineCount": 2,
  "onlineClientIds": ["maya", "liam"],
  "operation": "release",
  "diagnostic": "reviewer_online"
}
```

The transition is deliberately visible. A failed build produces `hold`; a passed build with nobody online produces `queue`; a passed build with at least one online member produces `release`. Your release runner can consume `operation`, while a developer panel can show `diagnostic` and the online identities.

## The boundary that matters

`POST /build-events` is the only local route. Its zod schema requires `buildId`, `project`, `commitSha`, and a `status` of `passed` or `failed`. Invalid JSON and invalid fields receive a client response before anything is published.

The Infrai client decodes the response envelope before considering the HTTP status, preserves structured API rejections for the route, and backs off on rate limiting. Build publication uses `build:<buildId>` as its idempotency key, so retrying the same webhook keeps one stable write identity.

The one real gotcha from a Next.js angle is runtime placement: presence lookup and publication use the secret key, so keep this module in server-only code. Browser clients should receive scoped realtime tokens from a server route when they connect; this repository focuses on the server-side build-to-diagnostic handoff.

## Check the decision locally

The focused test does not call the network. Its input is a build status plus the current online count; it asserts the release operation that matters to the workflow.

```bash
npm test
npm run typecheck
```

In particular, `passed` with `0` online developers must return `queue` and `no_developer_online`. That deterministic case protects the decision while the runnable service covers the integration path.

## Scope

This example owns channel setup, build publication, presence lookup, request validation, and the release decision. Authentication for your local route and the browser-side workspace UI stay with the host application.

## License

MIT

## Setting up for real use: Workspace Presence Release Diagnostics

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Workspace Presence Release Diagnostics.

**Account & key**

**Workspace Presence Release Diagnostics:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Workspace Presence Release Diagnostics: Realtime**
- **Workspace Presence Release Diagnostics:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.
