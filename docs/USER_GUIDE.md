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
3. Review imported GPX waypoints. DFIU projects them onto course miles, deduplicates equivalent entries, and adds Start/Finish when missing. Add or edit crew, pacer, water, medical, and drop-bag details as needed.
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

Plan A, B, and C are goal-time plans. Enter or edit a goal time and the plan recalculates automatically. Plan C also shows the race’s overall cutoff in hours next to the safety buffer, then the resulting finish (cutoff minus buffer). The plan includes moving time and aid-station stops, then shows predicted arrival time, segment pace, elapsed pace, and cutoff margin for each relevant course location.

**Plan A labels include the configured total goal in parentheses**, for example **Plan A (29:00)**. The time is hours and minutes for the whole race, including planned stops; it is not the duration of a training section. Changing the goal in **Pace Plan** updates these labels and section targets automatically. An unavailable goal reads **Plan A (not set)**.

Use **Settings** to set your runner profile and default aid-station delay. The profile adapts the plan for your climbing, descending, technical-terrain, night, temperature, altitude, and pacing-style strengths. It is a planning aid, not a guarantee.

Below the profile, **Race history** can pull tagged Strava races or import a GPX from a watch or race file. **Find races** only returns Strava Run, Trail Run, and Virtual Run activities you marked as a **Race** in Strava, with a start date in the last three years (1,095 days). It does not search activity names. An untagged race, or a race older than that window, will not appear until you mark it as Race on Strava (if it is recent enough) or import a GPX. If you have a very large Strava history, the search also stops after about 1,600 activities in that window. Choose which finishes to include; those calibrate an independent **estimated finish** and a **faster–slower range** on **Pace Plan**. That range is a band around one simulated finish, not percentiles of a results field. They do not change Plan A unless you choose **Use estimate as Plan A**. A 50K, 50-mile, or 100K result still counts, but less than a similar-distance finish when you are planning a 100. For targets under 200 miles, finishes of 200 miles or longer are excluded from calibration but remain saved; the estimate shows used and excluded counts. If none are comparable, it warns that it is using an uncalibrated fallback. Short road races stay unchecked by default in the Strava list.

The Pace Plan page also shows that ability-based range after you calculate. With no selected finishes it still appears, labeled as a low-confidence default (15:00 per mile on flat, not your measured ability). Add Strava or GPX finishes in Settings to calibrate it. The card links to Settings and to the [ability-based prediction](/documentation/algorithms#ability-based-prediction) algorithm notes.

## Overview, Crew, Pacer, and Live

**Overview** shows the event summary, selected aid-station weather temperatures, and Plan A arrival times. If the course visits an aid station multiple times, every predicted arrival is shown.

Use **Race Settings** in the race header to open **Edit Race** and configure **Support Plan** as **Solo**, **Crew only**, **Pacer only**, or **Crew and pacer**. Saving controls the Crew/Pacer tabs and crew-only bags. Existing plans default to Crew and pacer; turning support off preserves team assignments, notes, and packed items. This preference does not change the event's crew/pacer access rules or anyone's permissions. Members and sharing remain available.

The same **Links** section lets an editor customize the registration button label for providers or flows such as **Register on RunSignup**, **Enter Lottery**, or **Join Waitlist**. A blank label displays **Register Now**.

The header's **Event Plan** opens the complete planning workspace and appears selected while you are in it; selecting it again does not change the page. **Runner GPS** opens the runner location-sharing screen. These are views, independent of the Race Support choice.

**Pacer** lists course waypoints marked for pacer pickup, with their mileage and notes. Existing Pacer View links open this tab. Team assignments remain under **Members**.

**Crew** is a mobile-first course-day view. It shows aid stations only, current/predicted runner position, the next crew-accessible stop, its planned arrival, drop-bag details, check-ins, and a directions link. Directions open the selected destination in Google Maps; they are not in-app navigation or traffic-aware travel estimates.

**Live** supports an optional livestream/results embed, followed-runner ETAs, and runner check-ins. Check-ins re-anchor the remaining plan to observed progress.

## Drop Bags

**Drop Bag Planner** includes Start and Finish gear, designated drop-bag stations, and crew-only bags when Race Support includes crew. Solo and Pacer only hide crew-only bags from cards, All Bags, printing, and next-bag coverage. Designated drop bags remain available even if the station also allows crew. Start and Finish locations remain; redundant Start Gear, Finish Gear, and Official Drop Bag badges are omitted. Crew bags retain their identifying badge.

## Training routes and Strava analysis

In **Training**, import a GPX or use **Create Route** to draw one. Drawing uses Mapbox walking directions between clicks, and can display the race course and aid stations as references. The course overlay can be toggled on every training route. Imported and created routes retain detected course-overlap segments.

Open a training route to:

- See one **Route plan** summary and selectable **On-course sections**, split at official aid stations and Start/Finish. Selecting a section highlights its matching route stretch; select it again to clear.
- Read the whole-race goal in **Plan A (29:00)** separately from the section time beneath it. Tiny isolated matches under 0.25 miles are omitted. A continuous final approach remains one aid-station-to-Finish section even when the race reuses its opening road.
- Export the training route as a GPX file. Imported routes preserve their original GPX; manually created routes export their saved track.
- Connect Strava and enter one or more activity links or IDs, one per line.
- Choose **Analyze runs** to compare each matched training section independently with the configured Plan A goal. Comparison controls start expanded between the summary and section cards.

DFIU uses Strava **moving time**, not elapsed time. When Strava GPS and timing streams are available, it correlates the activity trace directly with the race GPX and uses only the matching directional pass. This means an out-and-back activity can contribute only its outbound half when the race runs that corridor once, even if the activity and saved training route start at different places. Otherwise DFIU uses a clearly limited distance-weighted moving-time estimate. Results and activity entries are saved with the training route and remain available in later sessions. **Against matched Plan A (29:00)** compares only the race miles actually covered by that activity, which can be shorter than the full section. If course geometry or matching changes, choose **Analyze runs** again to refresh saved activity mappings; changing only the goal recalculates the comparison automatically.

## Resources

Resources can be links or full-width text boxes. Link titles and links inside resource text open in the current tab; use your browser’s Back action to return. Text boxes support Markdown headings, lists, links, tables, and emphasis. Each custom resource can be reordered, enabled/hidden, assigned an icon, and optionally made printable. The Print button appears in the upper-right of the rendered text resource, like Schedule of Events.

Lodging & Dining and Schedule of Events are built-in Markdown sections. The resource icon menu includes lodging/bed and calendar choices in addition to the standard icons.

## Members and sharing

Use **Members** to add people with view or edit access, designate crew/pacer roles, keep an invitation pending without email, optionally send an email invite, or create a private read-only share link. Share links are intended for the exact recipient; do not post them publicly.

## Important limits

- GPX, GPS, weather, mapping, and Strava data can be incomplete or inaccurate. Verify critical navigation, cutoffs, access, and safety decisions independently.
- Terrain pairing only suggests reverse-direction physical overlap; review every suggested counterpart before saving.
- Weather values are planning inputs, not a live safety forecast.
- Crew distance is straight-line in the app; use the Google Maps link for driving directions.

For calculation details, see the [Algorithm Reference](/documentation/algorithms).
