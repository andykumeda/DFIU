# RBAC Status — Roles & Permissions

**Status:** Implemented for day-to-day race team management. Remaining work is admin/owner-transfer UI and second-account E2E.

## Implemented

- `site_admins` table for global admin bootstrap.
- `race_memberships` with per-race `owner` / `crew` / `pacer` roles plus `view` / `edit` permission (crew and pacer can both be true).
- RLS helpers: `user_can_view_race`, `user_can_edit_race`, `user_owns_race`, `user_can_manage_team`, `user_is_site_admin`, etc.
- `AuthContext` loads `isSiteAdmin` and a race membership map.
- `usePermission(raceId)` gates UI; race settings edit aligns with owner / race director / runner+edit (not arbitrary crew+edit).
- Members UI: add existing users, save pending access without email, optional invite email, resend, private read-only share link controls.
- Invite Edge Function `invite-race-member` requires caller JWT and `user_can_manage_team` (owners and runners who manage the team) — not “any member.”
- Private share tokens are not returned from broad race selects; managers load them via `get_race_share_settings`.

## Current Behavior

- Site admins have global view/edit in the permission hook and DB helpers.
- Team managers can add/update crew/pacer memberships and pending invites.
- View-only members can view the race but cannot mutate race-scoped data through RLS.
- Public races are readable under RLS; private share links require `?share=` + `x-dfiu-share-token`.

## Still Open

1. **Second-account E2E verification.** Owner, edit member, view member, pending invite, anonymous public race, share-link access.
2. **Owner transfer UI.** Atomic demote/promote flow.
3. **Admin panel.** `/admin` for site-admin user/race/member management.
4. **Audit trail.** Only if product needs edit history.
5. **Pacer leg scoping.** Not implemented; `edit` remains broad where granted.

## Key Files

- `supabase/migrations/20260503_rbac_memberships.sql`
- `supabase/migrations/20260503_member_rpcs.sql`
- `supabase/migrations/20260511_invite_pending_memberships.sql`
- `supabase/migrations/20260611_private_readonly_share_links.sql`
- `supabase/migrations/20260728_restrict_public_share_token.sql`
- `supabase/functions/invite-race-member/index.ts`
- `src/features/auth/AuthContext.tsx`
- `src/features/auth/usePermission.ts`
- `src/features/race/RaceMembersSection.tsx`
- `src/lib/race-select.ts`
- `src/pages/SetPasswordPage.tsx`
