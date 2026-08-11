# Spec: Automated Sync (scan + download + commit in one job)

## Problem Statement

Today the daily job only reports: it surfaces Missing maps on Telegram and the maintainer uploads images by hand. The maintainer wants the loop closed — the same daily job should download and commit the images itself, with the Telegram scan report kept and an extra run-result message added. Hand upload stays as a fallback for Steam API outages.

## Agreed design (grilling session, frontier empty)

- **One merged job.** The daily job becomes the **Sync**: enumerate → diff (with Stale detection) → rebuild Index → send the scan report → download Missing + re-download Stale → commit images and `index.json` together → send the run-result message. No separate upload workflow (one enumeration, no cross-workflow races).
- **Vocabulary.** New terms in `CONTEXT.md`: **Sync**, **Stale**, **Hand upload**; **Scan** becomes the read-only first phase; **Missing** is redefined as auto-download candidates.
- **Stale detection (ADR 0004).** A stored map is Stale when the winner's current `previewUrl` (original-resolution form) differs from the `previewUrl` recorded in `index.json`. Edges: no index record → never Stale; winner lost its preview → keep the stored image. Hand uploads get normalized (overwritten) by a later Sync whenever they diverge — deliberate, unprotected.
- **Report format.** Header `✅ N | ⬇️ N | 🔄 N | 🚫 N` (have / missing / stale / no-preview); Missing and Stale sections each list `name: workshop page URL`. Report is sent **before** downloads start.
- **Run-result message.** Sent **after** downloads finish, always (even when nothing to do): counts of downloaded / updated / failed with names; failures carry a reason.
- **Downloads.** Each image gets at most 3 attempts, 2 s between attempts. Successes are committed even when some fail; failures land in the result message and the run exits non-zero.
- **Telegram is advisory, not blocking.** A send failure never aborts the Sync; any send failure still makes the run exit non-zero. Fatal errors (enumeration, index) keep the existing best-effort failure notification, now `❌ Sync failed: …`.
- **Commit.** One commit by `github-actions[bot]`: `Sync: add N, update M image(s)`, only when something changed.
- **Local tools.** `pnpm download` (seed/debug) and `pnpm check` (hand-upload validator) stay; `pnpm scan` stays as the report-only view and now also sees Stale; README demotes hand upload to a fallback.

## Out of scope

- Deleting images for delisted maps (repo stays additive in deletions).
- Consumer-facing caching guidance beyond noting content mutability in ADR 0004.
