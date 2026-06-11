# RBAC Status — Roles & Permissions

**Status:** Mostly implemented. This file supersedes the older planned-phase version.

## Implemented

- `site_admins` table for global admin bootstrap.
- `race_memberships` table with per-race `owner`, `crew`, and `pacer` roles plus `view`/`edit` permission.
- RLS helper functions including `user_can_view_race`, `user_can_edit_race`, `user_owns_race`, and `user_is_race_member`.
- RLS rewrites for race-scoped data.
- `AuthContext` loads `isSiteAdmin` and race membership map.
- `usePermission(raceId)` is the UI gating source of truth.
- Race Detail gates editing on `canEdit` and Members tab on strict owner.
- Members UI can add existing users by email, with an optional email link.
- New-user access can be saved without sending email through `pending_race_memberships`; when the person later signs up with the same email, the pending membership is claimed automatically.
- Invite email sending for new users is explicit and still routes through `invite-race-member`, Supabase invite email, `/auth/set-password`, and pending-membership claim on signup.

## Current Behavior

- Site admins have global view/edit in the permission hook and DB helpers.
- Owners can manage members, grant edit permission, remove non-owner members, and cancel pending invites.
- Any race member can invite another user with view permission.
- Only owners can grant edit permission.
- View-only members can view the race but cannot mutate race-scoped data through RLS.

## Still Open

1. **Second-account E2E verification.** Test with separate owner, edit member, view member, pending invite, and anonymous public race access.
2. **Owner transfer UI.** Add a controlled flow that demotes the current owner and promotes another member, or otherwise updates the membership rows atomically.
3. **Admin panel.** Build `/admin` for site-admin user/race/member management.
4. **Audit trail.** Not implemented. Add only if product needs edit history or accountability.
5. **Pacer leg scoping.** Not implemented. Current `edit` permission applies broadly to race-scoped editable data.

## Key Files

- `supabase/migrations/20260503_rbac_memberships.sql`
- `supabase/migrations/20260503_member_rpcs.sql`
- `supabase/migrations/20260511_invite_pending_memberships.sql`
- `supabase/functions/invite-race-member/index.ts`
- `src/features/auth/AuthContext.tsx`
- `src/features/auth/usePermission.ts`
- `src/features/race/RaceMembersSection.tsx`
- `src/pages/SetPasswordPage.tsx`
