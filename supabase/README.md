# Supabase setup for XLive 18

This repository contains migration files only. They have **not** been applied to a live database yet.

## Safe setup sequence

1. Create a Supabase project from your own account and review its acceptable-use terms for your intended +18 service.
2. Open the project's SQL Editor.
3. Run `migrations/0001_initial_schema.sql` first.
4. Review the output and check Database > Tables and Database > Policies.
5. Review whether Supabase Storage is appropriate for your adult-content use case and cost. The storage migration is optional and must not be applied until provider policy and suitability are confirmed.
6. If approved, run `migrations/0002_private_video_storage.sql` second. It creates a private `video-originals` bucket with a 50 MiB file limit and owner-folder upload rules.
7. Configure authentication providers, email confirmation, rate limits, and recovery settings in the dashboard.
8. Do not put the service-role key in frontend code or GitHub. A publishable/anon key may be used in a browser only with correct RLS; privileged operations require a trusted server.
9. Test using at least two separate accounts: a user must not read another user's private video object, change review status, add room participants, or write purchase records.

## Important limitations

- A migration file in GitHub does not create a live Supabase project or apply the SQL automatically.
- The current schema is a first draft and has not yet been executed against PostgreSQL. Validate it in a disposable project before production.
- The private-storage migration is optional; do not run it until the storage provider's terms and limits are confirmed for the intended content.
- LiveKit room tokens, moderation transitions, notifications, signed video links, and payment webhooks are not implemented by these migrations.
- Do not upload actual user videos until the storage provider, moderation process, consent/age checks, and content policies are confirmed.
