#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: fetch_pr_review_context.sh <pr-number> [--repo owner/repo] [--output-dir path]

Fetches PR metadata, a raw PR view, the PR diff, and review comments into one
directory for later inspection.
EOF
}

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  fi
}

pr_number=""
repo=""
output_dir=""

while (($# > 0)); do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --repo)
      if (($# < 2)); then
        printf 'Missing value for %s\n' "$1" >&2
        exit 1
      fi
      repo="$2"
      shift 2
      ;;
    --output-dir)
      if (($# < 2)); then
        printf 'Missing value for %s\n' "$1" >&2
        exit 1
      fi
      output_dir="$2"
      shift 2
      ;;
    -*)
      printf 'Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [[ -n "$pr_number" ]]; then
        printf 'Unexpected argument: %s\n' "$1" >&2
        usage >&2
        exit 1
      fi
      pr_number="$1"
      shift
      ;;
  esac
done

if [[ -z "$pr_number" ]]; then
  usage >&2
  exit 1
fi

require_command gh
require_command jq

if [[ -z "$repo" ]]; then
  repo="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
fi

if [[ -z "$output_dir" ]]; then
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/pr-review-${pr_number}.XXXXXX")"
else
  mkdir -p "$output_dir"
fi

gh pr view "$pr_number" >"$output_dir/pr-view.txt"
gh pr view "$pr_number" \
  --json number,title,body,url,baseRefName,headRefName,author,isDraft,files \
  >"$output_dir/pr.json"
gh pr diff "$pr_number" >"$output_dir/pr.diff"
gh api "repos/$repo/pulls/$pr_number/comments" \
  | jq '[.[] | {
      path: .path,
      line: .line,
      diff_hunk: .diff_hunk,
      comment: .body,
      user: .user.login,
      created_at: .created_at,
    }]' >"$output_dir/review-comments.json"

printf 'output_dir=%s\n' "$output_dir"
printf 'pr_view=%s\n' "$output_dir/pr-view.txt"
printf 'pr_json=%s\n' "$output_dir/pr.json"
printf 'pr_diff=%s\n' "$output_dir/pr.diff"
printf 'review_comments=%s\n' "$output_dir/review-comments.json"
