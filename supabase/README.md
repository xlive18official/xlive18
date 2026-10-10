# Supabase setup for XLive 18

This directory contains the versioned SQL migration history for XLive 18.

## Current linked project

The schema and migrations through `0024_index_saved_video_foreign_key.sql` have been applied to the linked Supabase project used by this repository. The live database has RLS enabled on the application tables and the private video bucket. The GitHub Actions workflow has been added, but a successful CI run and end-to-end browser tests have not yet been confirmed.

## Reproducing the database in a fresh project

1. Create a Supabase project from your own account and review its acceptable-use terms for your intended +18 service.
2. Open the project's SQL Editor.
3. Apply the SQL migrations in ascending filename order, starting with `0001_initial_schema.sql`. Keep the base schema, policy changes, storage rules, and grant-tightening migrations in order.
4. Review Database > Tables, Policies, Functions, and Storage after each batch.
5. Configure authentication providers, email confirmation, rate limits, recovery settings, and any required age/identity verification in the dashboard.
6. Do not put the service-role key in frontend code or GitHub. The browser uses only the publishable key; privileged operations must remain in trusted server-side code.
7. Test with at least two separate accounts: private profile access, follow requests, blocks, message access, read receipts, report moderation, room cancellation, video upload, and review status transitions.

## Implemented database protections

- RLS on profiles, follows, blocks, videos, rooms, room members, reports, notifications, purchases, follow requests, and messages.
- Private profile discovery limited to authenticated users, a three-character prefix, and at most 20 results.
- Direct messages limited to connected accounts; a block prevents sending and hides the conversation.
- Message read receipts can only be updated through the `read_at` column.
- Client INSERT grants are restricted to user-controlled fields; moderation, provider references, and read receipts are not client-settable at insert time.
- Video originals remain in a private bucket. Only approved free public videos are available to other users; paid originals are not made public.
- Video review requires a reviewer and timestamp, and status transitions generate notifications.
- Room creation creates a pending request only. Hosts can cancel pending requests but cannot activate a live stream from the browser.
- Payment records have no client-side write policy; payment confirmation requires a trusted server webhook.

## Remaining production blockers

- Supabase's security advisor still flags the authenticated `public.search_profiles` SECURITY DEFINER RPC. It has a fixed empty search path, returns only minimal profile fields, requires sign-in, accepts a three-character prefix, and limits results to 20, but it still needs a documented security review before launch.
- Automated content scanning, transcoding, previews, and production moderation operations are not connected.
- No WebRTC/SFU provider or server-issued live-room tokens are configured.
- No payment provider or verified payment webhook is configured.
- Age confirmation is currently a self-attestation checkbox, not independent age verification.
- A successful GitHub Actions run, real account tests, and browser end-to-end tests have not been confirmed.

Do not upload real user content or launch paid/live features until the provider policies, moderation workflow, age/consent checks, operational monitoring, and applicable legal requirements are reviewed.
