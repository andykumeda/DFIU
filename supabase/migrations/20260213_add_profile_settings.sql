alter table "public"."profiles"
add column "units_distance" text not null default 'miles' check (units_distance in ('miles', 'kilometers')),
add column "units_elevation" text not null default 'feet' check (units_elevation in ('feet', 'meters')),
add column "clock_24h" boolean not null default false;
