// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface Env extends Cloudflare.Env {
	POLICY_AUD: string;
	TEAM_DOMAIN: string;
	/** Identity used for local development, where there is no Access JWT. */
	DEV_USER_EMAIL?: string;
	/** Secrets for AUTH_MODE=password. */
	BETTER_AUTH_SECRET?: string;
	SETUP_TOKEN?: string;
	/** Sender of password-reset mail; defaults to no-reply@<first DOMAINS entry>. */
	AUTH_FROM_ADDRESS?: string;
	/** Optional HTTPS relay used instead of the Cloudflare send_email binding. */
	OUTBOUND_WEBHOOK_URL?: string;
	OUTBOUND_WEBHOOK_SECRET?: string;
}
