# Search-based enumeration accepts probabilistic completeness

Enumerating the whole app-730 Workshop corpus (~142,000 items) takes 15-25 minutes and ~1,400 `QueryFiles` requests per run. The maintainer cares about run time, so WorkshopClient instead performs a single search pass (`search_text=kz`, `appid=730`, cursor-paginated to exhaustion): ~15 requests, under a minute. A single search pass empirically misses 5-17% of KZ candidates — Steam search results are relevance-ranked and drift between calls, and no `query_type` makes the ordering stable. That is acceptable because the repo is additive-only: the Scan only surfaces maps that are new to the repo, and images and index records are never removed (see ADR 0002). A missed map is therefore only a delayed discovery — each daily pass is an independent sample, so it turns up within a few days — never corrupted state.

## Considered Options

- Full-corpus enumeration — constructively complete, but 15-25 minutes and ~1,400 requests per run; also technically awkward (QueryFiles page-based pagination caps at ~501 pages, deep pagination only works via cursor starting at `cursor=*`). Implemented and measured in issue 01. Rejected: time cost outweighs the completeness guarantee, given the additive-only invariant.
- Multi-pass search with union-to-stable (repeat passes until a full pass adds nothing new) — empirically recovers the full set within a minute, but has no provable stopping condition. Rejected for simplicity: daily re-sampling already covers single-pass misses.

## Consequences

- The one-shot seed from `pnpm download` is probabilistically complete (starts ~5-17% short); later Scans fill the gap.
- Daily report counts fluctuate between runs with no change in the repo. This is expected and deliberately not smoothed.
- A newly published map can be invisible to search until Steam indexes it, and may then fall out of individual samples; worst case, first discovery is delayed by a few days.
- Maps that are in the repo but absent from a given sample keep their index records via the previous-record fallback.
