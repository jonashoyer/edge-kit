#!/bin/bash
# check-staleness.sh
# Scans all FEATURE.md files in the repo and flags any not updated within
# the staleness threshold (default: 90 days). Intended for use in CI.
#
# Usage:   ./scripts/check-staleness.sh
# Returns: exit 1 if any FEATURE.md files are stale, exit 0 if all are fresh

THRESHOLD_DAYS=${STALENESS_THRESHOLD_DAYS:-90}
STALE_FILES=()
TODAY=$(date +%s)

while read -r file; do
  # Extract Last Reviewed date from the file
  LAST_REVIEWED=$(grep -m 1 "^\*\*Last Reviewed:\*\*" "$file" | sed 's/\*\*Last Reviewed:\*\* //' | tr -d '[:space:]')

  if [[ -z "$LAST_REVIEWED" || "$LAST_REVIEWED" == "YYYY-MM-DD" ]]; then
    echo "⚠️  MISSING date: $file (Last Reviewed not set)"
    STALE_FILES+=("$file")
    continue
  fi

  # Parse date and calculate age in days
  if date -j -f "%Y-%m-%d" "$LAST_REVIEWED" > /dev/null 2>&1; then
    # macOS
    FILE_DATE=$(date -j -f "%Y-%m-%d" "$LAST_REVIEWED" +%s)
  else
    # Linux
    FILE_DATE=$(date -d "$LAST_REVIEWED" +%s)
  fi

  AGE_DAYS=$(( (TODAY - FILE_DATE) / 86400 ))

  if [ "$AGE_DAYS" -gt "$THRESHOLD_DAYS" ]; then
    echo "🔴 STALE ($AGE_DAYS days): $file — last reviewed $LAST_REVIEWED"
    STALE_FILES+=("$file")
  else
    echo "✅ Fresh ($AGE_DAYS days): $file"
  fi
done < <(find . -name "FEATURE.md" -not -path "*/node_modules/*" -not -path "*/.git/*")

if [ ${#STALE_FILES[@]} -gt 0 ]; then
  echo ""
  echo "❌ ${#STALE_FILES[@]} FEATURE.md file(s) exceed the ${THRESHOLD_DAYS}-day staleness threshold."
  echo "   Update 'Last Reviewed' and review the content of each flagged file."
  exit 1
fi

echo ""
echo "✅ All FEATURE.md files are within the ${THRESHOLD_DAYS}-day freshness threshold."
exit 0
