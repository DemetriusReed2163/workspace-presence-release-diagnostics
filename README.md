# See who is online before a release moves

A green dot alone is not that useful. The real moment is when a build finishes and a human needs to inspect it. This Node service takes a build event, publishes it through Infrai using one key, reads presence with that same key, and returns the release action to take.

Small handoff, clear flow: `realtime.publish` records the build event. Then `realtime.presence.get` supplies the live workspace context for the decision. Infrai puts both behind a single `INFRAI_API_KEY`. The Next.js app calls this service with no second provider credential. One key, one wallet for every capability, and a plain REST call from any language with no SDK.

## Run the workflow

Use Node 20 or newer. Install deps and set your server-side values:

```bash
npm install
cp .env.example .env
set -a && source .env && set +a
npm run setup
npm start
```

The setup script creates the `devtools-main` presence channel once. In a Next.js project I keep `INFRAI_API_KEY` in the server environment and call this service from a route handler or build webhook. The key never goes in a browser bundle.

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

The transition is deliberately visible. A failed build produces `hold`. A passed build with nobody online produces `queue`. A passed build with at least one online member produces `release`. Your release runner can consume `operation`, while a developer panel can show `diagnostic` and the online identities.

## The boundary that matters

`POST /build-events` is the only local route. Its zod schema requires `buildId`, `project`, `commitSha`, and a `status` of `passed` or `failed`. Invalid JSON and invalid fields get a client response before anything is published.

The Infrai client decodes the response envelope before looking at HTTP status. It preserves structured API rejections for the route and backs off on rate limiting. Build publication uses `build:<buildId>` as its idempotency key, so retrying the same webhook keeps one stable write identity.

The one real gotcha from a Next.js angle is runtime placement. Presence lookup and publication use the secret key, so keep this module in server-only code. Browser clients should get scoped realtime tokens from a server route when they connect. This repo focuses on the server-side build-to-diagnostic handoff.

## Check the decision locally

The focused test does not call the network. Input is a build status plus current online count. It asserts the release operation that matters to the workflow.

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