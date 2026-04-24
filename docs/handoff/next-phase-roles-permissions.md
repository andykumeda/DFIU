# Next Phase — Roles & Permissions (RBAC)

**Status:** Planned / design + implementation.
**Prereq:** Existing Supabase Auth (`AuthContext.tsx`), `races.user_id` column already tracks creator.

---

## Goal

Multi-tier role system so race directors can invite crew and pacers with scoped, per-event permissions. Site admin has global control.

## Roles

| Role | Scope | Capabilities |
|---|---|---|
| **Site Admin** | Global | Full CRUD on any user, race, course, waypoint. Manage other admins. User bans. Global settings. |
| **Event Owner** | Per-race | Full CRUD on *their* race (race director or whoever created the event). Invite/revoke crew + pacer. Set their permission level (view/edit). Transfer ownership. |
| **Crew** | Per-race (assigned) | View or Edit (per grant). Typical edit scope: waypoints, drop bags, aid station notes, pace-plan targets. Cannot delete race or reassign roles. |
| **Pacer** | Per-race (assigned) | View or Edit (per grant). Typical edit scope: pace-plan segments for the leg they pace. Often view-only by default. |
| **Default (authed user)** | Self | Own races only (current behavior). |

Permission grant = **(role, viewOnly | edit)** tuple per (user, race).

## Current State (what exists)

- Supabase Auth logged-in users. `AuthContext.tsx` exposes session.
- `races.user_id` = creator / implicit owner (no explicit `owner_id` or role tables).
- No role column anywhere. No admin concept. No grant tables.
- RLS state: not yet audited for this phase — must verify.

## What the User Must Provide / Decide

Design decisions blocking implementation:

1. **Admin bootstrap** — how is first site admin granted?
   - Manual Supabase SQL insert (simplest).
   - Env-var allowlist (email list → admin on login).
   - User preference?
2. **Invitation UX** — how does owner invite crew/pacer?
   - Email + magic link (user must sign up first).
   - Share code / invite link.
   - Pick from existing user list (search-by-email).
3. **Permission granularity** — are view/edit the only two levels? Or separate write scopes per resource (waypoints-only vs pace-plan-only)?
4. **Transfer of ownership** — can an owner hand off a race? Or only delete + recreate?
5. **Pacer leg scoping** — does a pacer's edit scope limit to their specific segment, or full pace plan? (Follow-up, not blocking initial ship.)
6. **Audit trail** — log who edited what? (Follow-up, not blocking initial ship.)

## Proposed Data Model

```sql
-- Site-level role
alter table auth.users add column is_site_admin boolean default false;
-- OR separate table:
create table site_admins (
  user_id uuid primary key references auth.users(id)
);

-- Per-race grants
create table race_memberships (
  race_id uuid references races(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text check (role in ('owner','crew','pacer')) not null,
  permission text check (permission in ('view','edit')) not null default 'view',
  granted_by uuid references auth.users(id),
  granted_at timestamptz default now(),
  primary key (race_id, user_id)
);

-- Backfill: every existing race.user_id → race_memberships row with role='owner', permission='edit'.
```

RLS policies then key off `race_memberships` instead of `user_id` directly.

## Work Breakdown

1. **Design checkpoint with user.** Resolve the 6 blocking decisions above before any code.
2. **Schema migration.** `race_memberships` + admin mechanism + backfill from `races.user_id`.
3. **RLS rewrite.** All race-scoped tables (races, courses, waypoints, drop_bags, pace_plans, terrain_segments) read/write keyed on membership + permission.
4. **AuthContext extension.** Expose `{ isSiteAdmin, memberships: Map<raceId, { role, permission }> }`.
5. **Permission hook.** `usePermission(raceId)` → `{ canView, canEdit, isOwner, isAdmin }`. Single source of truth for UI gating.
6. **UI gating.** Edit buttons / modals / drag handles check `canEdit`. Viewer-only paths render read-only.
7. **Invite flow.** Owner-side modal to add crew/pacer by email, select view/edit. Invitee-side acceptance (or auto-grant if user already exists).
8. **Admin panel.** Separate route (e.g. `/admin`) gated on `isSiteAdmin`. User list, race list, grant editing.
9. **Tests.** RLS policies must be exercised with a second account to confirm isolation. A pacer on race A must not see race B.

## Success Criteria

- Owner can invite a crew member with edit permission; crew logs in, sees the race on their dashboard, can edit waypoints, cannot delete the race.
- Pacer with view-only cannot trigger any mutation (verified at RLS, not just UI).
- Site admin can view and edit any race regardless of ownership.
- Non-owners cannot reassign roles.
- Existing races remain owned by their original creator after migration (backfill).

## Reference

- Existing auth: `src/features/auth/AuthContext.tsx`, `src/lib/supabase.ts`.
- Existing race creator column: `races.user_id` → FK `races_user_id_fkey`.
- Supabase RLS docs: check via Supabase MCP `search_docs` when writing policies.

## Relationship to Other Phases

Independent of descent-verification phase. Can ship in parallel or sequentially. No shared files.
