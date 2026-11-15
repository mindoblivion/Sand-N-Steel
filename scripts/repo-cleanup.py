#!/usr/bin/env python3
"""Conservative, manually gated branch cleanup for Sand & Steel.

Dry-run is the default. Execution only retires branches whose current tip is
already an ancestor of the pinned main commit, or exactly matches the head
of a merged PR into main. Protected branches are never candidates.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from urllib.parse import quote

REPO = os.environ.get("GITHUB_REPOSITORY", "mindoblivion/Sand-N-Steel")
BASELINE = os.environ.get("GITHUB_SHA", "")
EXECUTE = os.environ.get("EXECUTE_CLEANUP", "false").lower() == "true"
PROTECTED = {"main", "release/colosseum-60d"}
TAG = "v0.1-cleanup"


def run(args: list[str], *, check: bool = True, capture: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(args, text=True, capture_output=capture)
    if check and result.returncode:
        raise RuntimeError(
            f"Command failed ({result.returncode}): {' '.join(args)}\n"
            f"{result.stderr.strip()}"
        )
    return result


def api_list(endpoint: str) -> list[dict]:
    result = run(["gh", "api", "--paginate", "--jq", ".[]", endpoint])
    return [json.loads(line) for line in result.stdout.splitlines() if line.strip()]


def is_ancestor(sha: str) -> bool:
    result = run(["git", "merge-base", "--is-ancestor", sha, BASELINE], check=False)
    if result.returncode not in (0, 1):
        raise RuntimeError(f"Could not compare branch commit {sha} with baseline")
    return result.returncode == 0


def main() -> int:
    if not BASELINE or len(BASELINE) != 40:
        raise RuntimeError("Missing or invalid workflow commit SHA")

    run(["git", "fetch", "origin", "+refs/heads/*:refs/remotes/origin/*", "--prune"])
    main_sha = run(["git", "rev-parse", "refs/remotes/origin/main"]).stdout.strip()
    if main_sha != BASELINE:
        raise RuntimeError(
            f"main moved during this run. Workflow SHA={BASELINE}; origin/main={main_sha}. "
            "Dispatch again from the current main branch."
        )

    existing_tag = run(
        ["git", "ls-remote", "--exit-code", "--tags", "origin", f"refs/tags/{TAG}"],
        check=False,
    )
    if existing_tag.returncode == 0:
        raise RuntimeError(f"Tag {TAG} already exists. No branches were changed.")
    if existing_tag.returncode != 2:
        raise RuntimeError(f"Could not verify whether tag {TAG} already exists")

    branches = api_list(f"repos/{REPO}/branches?per_page=100")
    closed_prs = api_list(f"repos/{REPO}/pulls?state=closed&per_page=100")

    merged_main_heads: set[tuple[str, str]] = set()
    unmerged_heads: set[str] = set()
    for pr in closed_prs:
        head = pr.get("head") or {}
        head_repo = (head.get("repo") or {}).get("full_name")
        if head_repo != REPO:
            continue
        ref = head.get("ref")
        sha = head.get("sha")
        if not ref or not sha:
            continue
        if pr.get("merged_at") and (pr.get("base") or {}).get("ref") == "main":
            merged_main_heads.add((ref, sha))
        elif not pr.get("merged_at"):
            unmerged_heads.add(ref)

    candidates: list[tuple[str, str, str]] = []
    kept: list[tuple[str, str, str]] = []
    for branch in branches:
        name = branch["name"]
        sha = branch["commit"]["sha"]
        if name in PROTECTED or branch.get("protected", False):
            kept.append((name, sha, "protected by cleanup policy or GitHub"))
            continue
        if is_ancestor(sha):
            candidates.append((name, sha, "tip is already an ancestor of main"))
            continue
        if name not in unmerged_heads and (name, sha) in merged_main_heads:
            candidates.append((name, sha, "exact current tip merged into main by PR"))
            continue
        kept.append((name, sha, "unique, unmerged, or insufficient merge evidence"))

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    lines = [
        "# Sand & Steel repository cleanup",
        "",
        f"- Repository: `{REPO}`",
        f"- Pinned baseline: `{BASELINE}`",
        f"- Mode: **{'EXECUTE' if EXECUTE else 'DRY RUN'}**",
        f"- Branches inspected: **{len(branches)}**",
        f"- Eligible for retirement: **{len(candidates)}**",
        f"- Preserved: **{len(kept)}**",
        "",
        "## Eligible branches",
    ]
    lines.extend([f"- `{name}` — {reason}" for name, _, reason in candidates] or ["- None"])
    lines.extend(["", "## Preserved branches", ""])
    lines.extend([f"- `{name}` — {reason}" for name, _, reason in kept] or ["- None"])

    if EXECUTE:
        deleted: list[str] = []
        for name, _, _ in candidates:
            ref = quote(f"heads/{name}", safe="/")
            run(["gh", "api", "--method", "DELETE", f"repos/{REPO}/git/refs/{ref}"])
            deleted.append(name)

        run(["git", "config", "user.name", "github-actions[bot]"])
        run(["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"])
        run(["git", "tag", "-a", TAG, BASELINE, "-m", "Sand & Steel v0.1 cleanup baseline"])
        run(["git", "push", "origin", f"refs/tags/{TAG}"])
        lines.extend([
            "",
            "## Execution result",
            f"- Deleted branches: **{len(deleted)}**",
            f"- Created annotated tag: `{TAG}` at `{BASELINE}`",
        ])
    else:
        lines.extend([
            "",
            "## Next step",
            "Review this report. If the candidate list is correct, rerun this workflow "
            "with **execute_cleanup=true**. The execution run recomputes all evidence.",
        ])

    report = "\n".join(lines) + "\n"
    print(report)
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as summary:
            summary.write(report)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"::error::{exc}", file=sys.stderr)
        raise SystemExit(1)
