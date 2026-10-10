# XLive 18 admin setup

Moderation actions are available only when the authenticated user's **app metadata** contains `role: "admin"`. Do not use editable user metadata for this role: users must never be able to grant themselves moderation privileges.

## Granting the first admin

Use a trusted, private environment with the Supabase service-role key stored in an environment variable. Never put the service-role key in `index.html`, `auth.js`, `supabase-config.js`, or any browser bundle.

Example Node.js script (run locally from a secured administrator machine):

```js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const userId = process.env.XLIVE_FIRST_ADMIN_USER_ID;
if (!userId) throw new Error('Set XLIVE_FIRST_ADMIN_USER_ID');

const { data: current, error: readError } = await supabase.auth.admin.getUserById(userId);
if (readError) throw readError;

const appMetadata = { ...(current.user.app_metadata || {}), role: 'admin' };
const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
  app_metadata: appMetadata
});
if (updateError) throw updateError;

console.log('Admin role updated. Sign out and sign in again to refresh the JWT.');
```

Required environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `XLIVE_FIRST_ADMIN_USER_ID`

Keep the script out of the public repository if your operational policy requires it. The service-role key bypasses RLS and must be treated as a production secret.

## What admins can review

- Pending videos: approve or reject.
- Approved videos: remove from public playback.
- User reports: move to review, resolve, or dismiss.

Room requests remain pending until a real streaming provider and trusted server-side token flow are configured. Do not manually mark rooms live as a substitute for provider integration.
