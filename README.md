<div align="center">
  <img src="./public/logo.svg" alt="Open Inbox" height="64">
  <p><em>A self-hosted, multi-user, multilingual email client with an AI agent, running on Cloudflare Workers</em></p>
</div>

Open Inbox is an independent open-source project. It started as a fork of [cloudflare/agentic-inbox](https://github.com/cloudflare/agentic-inbox) (Apache-2.0) and has since diverged: it is developed, versioned and released on its own and is not affiliated with or endorsed by Cloudflare. Credit for the original architecture goes to the Agentic Inbox authors; see [LICENSE](LICENSE).

Open Inbox lets you send, receive, and manage emails through a modern web interface, all on your own Cloudflare account. Incoming emails arrive via [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/), each mailbox is isolated in its own [Durable Object](https://developers.cloudflare.com/durable-objects/) with a SQLite database, and attachments are stored in [R2](https://developers.cloudflare.com/r2/).

**What Open Inbox adds on top of Agentic Inbox**

- **Multi-user access control:** owners and members per mailbox, enforced on the API, the agent and MCP
- **Internationalization:** English and Vietnamese UI, easy to extend with more languages; outgoing mail follows the mailbox language; accent-insensitive search
- **Labels and filter rules** applied to incoming mail
- **Pluggable outbound provider:** Cloudflare Email Service or your own HTTP relay
- Validation, tests and CI across the API

An **AI-powered Email Agent** can read your inbox, search conversations, and draft replies, built with the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/) and [Workers AI](https://developers.cloudflare.com/workers-ai/).

![Open Inbox screenshot](./demo_app.png)


Background reading from the upstream project: this blog post explains Cloudflare Email Service and how to use it with the Agents SDK, MCP, and from the Wrangler CLI: [Email for Agents](https://blog.cloudflare.com/email-for-agents/).

## How to setup

**Important**: Clicking the 'Deploy to Cloudflare' button is only one part of the setup. You must follow the **After deploying** steps as well. For a step-by-step guide with screenshots, see this comment on the upstream Agentic Inbox repo (the setup steps are the same): 
https://github.com/cloudflare/agentic-inbox/issues/4#issuecomment-4269118513

### To set up

1. Deploy to Cloudflare. The deploy flow will automatically provision R2, Durable Objects, and Workers AI. You'll be prompted for **DOMAINS**, which is the domain (yourdomain.com) you want to receive emails for (email@yourdomain.com).

     [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/tuanhaviet22/open-inbox)

2. **Configure Cloudflare Access** -- Enable [one-click Cloudflare Access](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/) on your Worker under Settings > Domains & Routes. The modal will show your `POLICY_AUD` and `TEAM_DOMAIN` values. `TEAM_DOMAIN` can be either your Access team URL or the full `.../cdn-cgi/access/certs` URL. **You must set these as secrets for your Worker.**
3. **Set up Email Routing** -- In the Cloudflare dashboard, go to your domain > Email Routing and create a catch-all rule that forwards to this Worker
4. **Enable Email Service** -- The worker needs the `send_email` binding to send outbound emails. See [Email Service docs](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/)
5. **Create a mailbox** -- Visit your deployed app and create a mailbox for any address on your domain (e.g. `hello@example.com`)

### Troubleshooting Access

1. If you see `Invalid or expired Access token`, that usually means `POLICY_AUD` or `TEAM_DOMAIN` secrets are incorrect.
   * Resolution: [turn Access off and back on for the Worker to get the Access modal again](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/), then reset your Worker secrets to the latest `POLICY_AUD` and `TEAM_DOMAIN` values shown there.
2. If you see `Cloudflare Access must be configured in production`, this application is intentionally enforcing Cloudflare Access so your inbox is not exposed to anyone on the internet.
   * Resolution: enable Access using [one-click Cloudflare Access for Workers](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/), then set the `POLICY_AUD` and `TEAM_DOMAIN` Worker secrets from the modal values.

## Features

- **Full email client** — Send and receive emails via Cloudflare Email Routing with a rich text composer, reply/forward threading, folder organization, search, and attachments
- **Per-mailbox isolation** — Each mailbox runs in its own Durable Object with SQLite storage and R2 for attachments
- **Built-in AI agent** — Side panel with 9 email tools for reading, searching, drafting, and sending
- **Auto-draft on new email** — Agent automatically reads inbound emails and generates draft replies, always requiring explicit confirmation before sending
- **Configurable and persistent** — Custom system prompts per mailbox, persistent chat history, streaming markdown responses, and tool call visibility

## Stack

- **Frontend:** React 19, React Router v7, Tailwind CSS, Zustand, TipTap, `@cloudflare/kumo`
- **Backend:** Hono, Cloudflare Workers, Durable Objects (SQLite), R2, Email Routing
- **AI Agent:** Cloudflare Agents SDK (`AIChatAgent`), AI SDK v6, Workers AI (`@cf/moonshotai/kimi-k2.5`), `react-markdown` + `remark-gfm`
- **Auth:** Cloudflare Access JWT validation (required outside local development)

## Getting Started

```bash
npm install
npm run dev
```

### Configuration

1. Set your domain in `wrangler.jsonc`
2. Create an R2 bucket named `open-inbox`: `wrangler r2 bucket create open-inbox`

### Deploy

```bash
npm run deploy
```

## Prerequisites

- Cloudflare account with a domain
- [Email Routing](https://developers.cloudflare.com/email-routing/) enabled for receiving
- [Email Service](https://developers.cloudflare.com/email-service/) enabled for sending
- [Workers AI](https://developers.cloudflare.com/workers-ai/) enabled (for the agent)
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) configured for deployed/shared environments (required in production)

### Authentication modes

Set `AUTH_MODE` in `wrangler.jsonc`:

- `access` (default): Cloudflare Access protects the Worker (see the setup steps above).
- `password`: the Worker can be public and Open Inbox asks users to sign in with email and password ([Better Auth](https://www.better-auth.com) on D1). Self-service sign-up is disabled: admins create users.

Setting up `password` mode:

1. Create the D1 database and apply the migrations: `wrangler d1 create open-inbox-auth`, put its id in `wrangler.jsonc` (`d1_databases[0].database_id`), then `wrangler d1 migrations apply DB --remote`.
2. Set `AUTH_MODE` to `password`, `BETTER_AUTH_URL` to your public URL (e.g. `https://mail.example.com`) and `ADMIN_EMAILS` to your admin address(es).
3. Add secrets: `wrangler secret put BETTER_AUTH_SECRET` (a long random string) and `wrangler secret put SETUP_TOKEN` (another one).
4. Create the first admin once (the email must be in `ADMIN_EMAILS`):
   `curl -X POST https://mail.example.com/api/setup -H 'content-type: application/json' -d '{"token":"<SETUP_TOKEN>","email":"you@example.com","password":"<at least 10 characters>"}'`
   You can then remove `SETUP_TOKEN`. The endpoint only works while there are no users.
5. Sign in, then add people under **Account > Manage users**, and give them mailboxes in each mailbox's Settings.

Details: failed sign-ins are rate limited (5 per minute per IP, stored in D1), state-changing requests must come from your own origin, password reset mails are sent through your outbound provider from `no-reply@<first domain>` (override with `AUTH_FROM_ADDRESS`), and the app refuses to run in this mode without `ADMIN_EMAILS` and `BETTER_AUTH_SECRET`. For MCP clients (Claude Code, Cursor) create an API key under **Account** and send it as `Authorization: Bearer <key>`. Password hashing uses scrypt, which is CPU heavy; if sign-in hits Workers CPU limits on the free plan, use a paid plan.

### Access model

By default (`ADMIN_EMAILS` empty) any user who passes the shared Cloudflare Access policy can access all mailboxes, including through the MCP server at `/mcp`.

To enable per-mailbox authorization, set `ADMIN_EMAILS` (comma-separated) in `wrangler.jsonc` or as a secret. Then:

- Identity comes from the `email` claim of the Access JWT (locally, `DEV_USER_EMAIL`, default `dev@localhost`).
- Admins can see every mailbox and create new ones. Each mailbox has **owners** (manage settings and members) and **members** (read and send).
- The rules apply to the web API, the agent WebSocket (`/agents/*`) and MCP. Users without access get a 404.
- Owners manage members from the mailbox Settings page.

## Outbound providers

Mail is sent through the Cloudflare `send_email` binding by default. To use another service, set `OUTBOUND_WEBHOOK_URL` (and optionally the `OUTBOUND_WEBHOOK_SECRET` secret): Open Inbox will POST each outgoing message as JSON (`to`, `from`, `subject`, `html`, `text`, `attachments`, ...) with `Authorization: Bearer <secret>` and expects a 2xx reply, optionally `{ "messageId": "..." }`. Workers cannot open raw SMTP/IMAP connections, so an HTTP relay you host (SMTP bridge, SES, Postmark, ...) is the supported way. Receiving is still done by Cloudflare Email Routing.

## Branding

The logo shown on the sign-in page and the mailbox list is `public/brand/logo.svg`, and the browser icon is `public/favicon.svg` / `public/favicon.ico`. A deployment can brand the app by replacing those files; no code changes are needed. Use a horizontal logo that reads well at about 36 px tall on a light background.

## Signatures

Each mailbox can have several signatures (Settings > Signatures), written in the rich text editor. The one marked as default is added to new messages, replies and forwards, and the composer toolbar lets you insert any other signature at the cursor. Mailboxes that had the older single signature keep it as their default.

## Labels and filters

Each mailbox has labels (color-coded, toggled on an email from the reading pane) and filter rules in Settings. A rule matches new incoming mail on sender, recipient, subject or text, and can add a label, move to a folder, mark as read or star. The agent auto-draft is skipped when a rule moves the mail out of the inbox.

## Internationalization

The UI ships in English and Vietnamese. The language is chosen from the `lang` cookie (set by the language switcher), then `Accept-Language`, then English. Text that goes into outgoing mail (quote headers, forward blocks) follows the mailbox's *Language of outgoing email* setting.

To add a language:

1. Add the code to `SUPPORTED_LOCALES` and `LOCALE_NAMES` in `shared/locales.ts`.
2. Copy `app/locales/en/` to `app/locales/<code>/` and translate the JSON files.
3. Add the language to `shared/mail-strings.ts`.
4. Run `npm test`: a test checks every language has the same keys as English.

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser    │────>│  Hono Worker     │────>│  MailboxDO      │
│  React SPA   │     │  (API + SSR)     │     │  (SQLite + R2)  │
│  Agent Panel │     │                  │     └─────────────────┘
└──────┬───────┘     │  /agents/* ──────┼────>┌─────────────────┐
       │             │                  │     │  EmailAgent DO  │
       │ WebSocket   │                  │     │  (AIChatAgent)  │
       └─────────────┤                  │     │  9 email tools  │
                     │                  │────>│  Workers AI     │
                     └──────────────────┘     └─────────────────┘
```

## License

Apache 2.0 -- see [LICENSE](LICENSE).
