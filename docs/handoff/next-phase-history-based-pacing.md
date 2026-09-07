# History-Based Pacing Follow-up

The target-time distributor and independent history-calibrated estimate are implemented. Current behavior and formulas live in [Algorithm Reference](../ALGORITHMS.md); usage lives in [User Guide](../USER_GUIDE.md).

History is managed in Settings through reviewed Strava race selection, GPX import, and manual entry. Selected finishes calibrate the estimate using consistent effort distance and symmetric distance similarity. For targets under 200 miles, 200+ mile finishes are excluded but remain saved. Plan A changes only when the runner explicitly applies an estimate or edits the goal.

## Remaining work

- Validate against a representative set of known finishes before narrowing the planning band or increasing confidence.
- Evaluate whether terrain mix, altitude, and weather can support evidence-based historical weighting.
- Preserve private, user-scoped history if contributing records are ever exposed outside Settings.
- Consider exact/similar-race suggestions only when source data and user review support them.

Source: `src/features/race/pace-prediction.ts`, `race-history-gpx.ts`, `StravaRaceHistoryPanel.tsx`, and `src/features/settings/SettingsPage.tsx`. Database evolution belongs in the existing migrations; this note does not duplicate a schema snapshot.
