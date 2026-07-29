#!/usr/bin/env bash
# Fail fast if core app sources are missing from the working tree.
# Prevents silent data loss when git state or tooling leaves tracked files deleted.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REQUIRED=(
  src/types/database.ts
  src/features/auth/usePermission.ts
  src/features/race/RaceDetail.tsx
  src/features/race/CrewView.tsx
  src/features/race/PaceCalculator.tsx
  src/features/race/DropBagModal.tsx
  src/features/race/DropBagsSection.tsx
  src/features/race/RaceResources.tsx
  src/features/race/pace-utils.ts
  src/features/race/usePacePlans.ts
  src/features/race/drop-bag-shared.ts
  src/features/race/resources-shared.ts
  src/features/race/pace-chart-columns.ts
  src/components/Markdown.tsx
  src/lib/race-select.ts
  src/features/race/share-link.ts
  HANDOFF.md
)

missing=()
for f in "${REQUIRED[@]}"; do
  if [[ ! -f "$f" ]]; then
    missing+=("$f")
  fi
done

if ((${#missing[@]} > 0)); then
  echo "ERROR: ${#missing[@]} required file(s) missing from working tree:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  echo "Restore with: git restore --source=HEAD -- ${missing[*]}" >&2
  exit 1
fi

echo "verify-critical-files: OK (${#REQUIRED[@]} paths)"
