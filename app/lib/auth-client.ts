// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { createAuthClient } from "better-auth/react";

/** Browser client for the Better Auth endpoints under /api/auth (AUTH_MODE=password). */
export const authClient = createAuthClient();
