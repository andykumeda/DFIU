# DFIU User Guide

DFIU brings a race course, pace plan, logistics, crew coordination, training routes, and shared resources into one race workspace. This guide describes the current product behavior for race owners, runners, crew, and pacers.

## Start here

Most people begin by opening a public event and choosing **Clone Race** to make a personal planning copy. You can also create a new event from **New Race** when you are starting without an existing public course.

### Clone an existing event

1. Open a public event from **Public Events**.
2. Choose **Clone Race**. If you have already cloned that event, DFIU asks you to provide a different name for the new copy.
3. Review the copied course, date, start time, time zone, weather details, waypoints, and resources.
4. Adjust terrain and create a Plan A goal time on **Pace Plan**.
5. Share the event with your runner, crew, and pacers from **Members**.

### Create a new event

1. Choose **New Race** and enter the event date, start time, time zone, and weather details.
2. Upload the race GPX on **Map & Aid Stations**.
3. Add Start, Finish, aid stations, and any relevant crew, pacer, water, medical, or drop-bag details.
4. Define terrain and create a Plan A goal time on **Pace Plan**.
5. Share the event with your runner, crew, and pacers from **Members**.

Race owners can edit the event. Other people see only the sections allowed by their membership or share link.

## Map & Aid Stations

The map supports Outdoors, Streets, and Satellite base maps. Use the upper-left controls to switch base map, show/hide mile markers, and show/hide landmarks. The lower-right legend explains the terrain colors.

### Waypoints

Add waypoints while editing the course. Each waypoint can have crew, pacer, drop-bag, cutoff, delay, and notes information. Start and Finish are treated as crew-accessible. On an out-and-back course, the same physical location can appear more than once; each visit keeps its own race mile and settings.

### Terrain

Terrain is a sequence of course-mile boundaries: a type applies from its start mile until the next terrain boundary. The available types are:

| Type | Default pacing difficulty |
| --- | ---: |
| Paved / Road | 100% |
| Smooth Dirt / Gravel | 104% |
| Runnable Trail | 110% |
| Technical Trail | 118% |
| Highly Technical | 130% |

To create a segment, enable editing, select its start and end on the map (or drag a range in the elevation profile), choose the terrain type, and save. You can also add and edit ranges in the Terrain side panel. Selecting a side-panel range outlines that segment on the map.

For a confirmed out-and-back, DFIU detects a continuous reverse-direction pass of the same trail and presents the matched race-mile range in the terrain dialog. It is selected by default; clear its checkbox if the return leg should intentionally differ. Later sidebar type changes, range edits, and deletions also update detected reverse passes. This matching is conservative: crossings, nearby switchbacks, and same-direction paths are not treated as a pair.

## Pace Plan

Plan A, B, and C are goal-time plans. Enter or edit a goal time and the plan recalculates automatically. The plan includes moving time and aid-station stops, then shows predicted arrival time, segment pace, elapsed pace, and cutoff margin for each relevant course location.

Use **Settings** to set your runner profile and default aid-station delay. The profile adapts the plan for your climbing, descending, technical-terrain, night, temperature, altitude, and pacing-style strengths. It is a planning aid, not a guarantee.

Below the profile, **Race history** can pull tagged Strava races or import a GPX from a watch or race file. Choose which finishes to include; those calibrate an independent P10–P90 predicted range on **Pace Plan**. They do not change Plan A unless you choose **Use P50 as Plan A**. A 50K, 50-mile, or 100K result still counts, but less than a similar-distance finish when you are planning a 100. Short road races stay unchecked by default in the Strava list. Only activities marked as a Race in Strava appear there; untagged efforts are not guessed from titles.

The Pace Plan page also shows that ability-based range after you calculate. With no selected finishes it still appears, labeled as a low-confidence default (15:00 per mile on flat, not your measured ability). Add Strava or GPX finishes in Settings to calibrate it. The card links to Settings and to the [ability-based prediction](/documentation/algorithms#ability-based-prediction) algorithm notes.

## Overview, Crew, and Live

**Overview** shows the event summary, selected aid-station weather temperatures, and Plan A arrival times. If the course visits an aid station multiple times, every predicted arrival is shown.

**Crew** is a mobile-first course-day view. It shows aid stations only, current/predicted runner position, the next crew-accessible stop, its planned arrival, drop-bag details, check-ins, and a directions link. Directions open the selected destination in Google Maps; they are not in-app navigation or traffic-aware travel estimates.

**Live** supports an optional livestream/results embed, followed-runner ETAs, and runner check-ins. Check-ins re-anchor the remaining plan to observed progress.

## Training routes and Strava analysis

In **Training**, import a GPX or use **Create Route** to draw one. Drawing uses Mapbox walking directions between clicks, and can display the race course and aid stations as references. The course overlay can be toggled on every training route. Imported and created routes retain detected course-overlap segments.

Open a training route to:

- See its course-overlap ranges and Plan A time for each overlapping race segment.
- Export the training route as a GPX file. Imported routes preserve their original GPX; manually created routes export their saved track.
- Connect Strava and enter one or more activity links or IDs, one per line.
- Compare each matched training section independently with Plan A.

DFIU uses Strava **moving time**, not elapsed time. When Strava streams are available, it uses the timing of each matched training portion; otherwise it uses a clearly limited distance-weighted moving-time estimate. Results and activity entries are saved with the training route and remain available in later sessions.

## Resources

Resources can be links or full-width text boxes. Link titles open directly in a new tab. Text boxes support Markdown headings, lists, links, tables, and emphasis. Each custom resource can be reordered, enabled/hidden, assigned an icon, and optionally made printable. The Print button appears in the upper-right of the rendered text resource, like Schedule of Events.

Lodging & Dining and Schedule of Events are built-in Markdown sections. The resource icon menu includes lodging/bed and calendar choices in addition to the standard icons.

## Members and sharing

Use **Members** to add people with view or edit access, designate crew/pacer roles, keep an invitation pending without email, optionally send an email invite, or create a private read-only share link. Share links are intended for the exact recipient; do not post them publicly.

## Important limits

- GPX, GPS, weather, mapping, and Strava data can be incomplete or inaccurate. Verify critical navigation, cutoffs, access, and safety decisions independently.
- Terrain pairing only suggests reverse-direction physical overlap; review every suggested counterpart before saving.
- Weather values are planning inputs, not a live safety forecast.
- Crew distance is straight-line in the app; use the Google Maps link for driving directions.

For calculation details, see the [Algorithm Reference](/documentation/algorithms).
