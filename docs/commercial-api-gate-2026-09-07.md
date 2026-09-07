# Commercial/API Gate — 2026-09-07

## Sleeper

Official Sleeper API documentation states that the API is free for non-commercial purposes and that commercial users must contact Sleeper directly to discuss licensing. The API is read-only and Sleeper also advises clients to remain under 1000 API calls per minute.

Source checked: https://docs.sleeper.com/ on 2026-09-07.

## Product rule

The Fantasy Football Matrix may develop and QA its Sleeper adapter before commercial licensing is resolved, but Sleeper-dependent functionality must not be represented as commercially cleared or used as the basis of a paid entitlement until commercial permission/licensing evidence is recorded.

The code gate requires both:

1. an explicit `sleeperLicenseApproved` approval state, and
2. a non-empty evidence reference.

A bare boolean is intentionally insufficient.

## Manual provider

The Manual provider has no dependency on an external fantasy-platform API and is not blocked by the Sleeper commercial gate.

## Other platforms

All future platform adapters default to `unreviewed` and commercially blocked until their API and licensing terms are reviewed.

## Current status

- Manual: commercially usable from this platform-policy perspective.
- Sleeper: `pending_license` / commercially blocked.
- Yahoo, Fleaflicker, ESPN, NFL, CBS, MyFantasyLeague: unreviewed in this gate until ABL-15 feasibility/licensing review.

This gate does not itself enable billing, deployment, or production access.