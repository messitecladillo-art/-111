# County publication contract (proposed integration)

`lib/topic-publication.ts` is an offline, pure domain gate. It performs no publication,
network, storage, client-owner authorization or source-truth verification. Global content
can enter a release only through a **maintainer-reviewed Git PR**. The receipts below are
declarations to review in that PR; names, hashes and UI capability declarations do not
authenticate a person, prove reading, or prove that a source supports a statement.

## Inputs and fingerprints

`prepareTopicPublication(rawPack, author, sourceReads)` parses the existing county-pack
schema without changing any `draft` status. It accepts only current, canonical county
geography and the current catalog version. Pack SHA256 is over the **exact UTF8 JSON
bytes**, including whitespace. Duplicate JSON members, dynamic properties, sparse arrays,
unknown fields and invalid dates/IDs/source references are rejected.

`sourceReads` is separate because the existing draft does not carry actual read coverage:

```ts
{ sourceId, coverage: 'fulltext' | 'listing_only' | 'unread',
  readAt: '2026-10-15T08:00:00.000Z' | null,
  locator: 'Actual body paragraphs or exact listing entry', supportedFactIds: [] }
```

`fulltext` means the declared body scope was read, not that every word or attachment was
read. A listing may support an exact listed-entry fact with review scope `listing_entry`;
it cannot support `body_claim`. Missing/unread evidence supports neither. A fact must
also occur verbatim in every cited source's declared `supportedClaims`. These mechanical
checks cannot detect a false declaration. Source publisher, URL, locator, publication
date (including `null`), retrieval date, fact `asOfDate`, gaps, original fact text and
proposed research direction remain intact. Plans remain plans in the original text.

Each manifest item binds the exact pack hash, author, county identity/tags/gaps, item,
referenced source metadata and its read record. Its hash uses the accepted bounded
`evix-topic-transfer-json/1` encoder over
`{contract:'evix-topic-publication/item/1',value:{...}}`. Draft/release fingerprints use
the same wrapper with `draft`/`release`. These are publication-domain wrappers, not a
change to questionnaire or legacy JSON hashes.

## Explicit release and withdrawal

`applyTopicPublication({rawPack, author, sourceReads, history, decision, now})` returns a
new frozen append-only release history. `now`, `readAt`, `reviewedAt` require canonical
UTC timestamps with milliseconds. Every selected fact and direction needs one approval:

```ts
{ id, packId, contentVersion, packHash, itemId, itemHash, author, reviewer,
  reviewedAt, decision: 'approve', scope: 'listing_entry' | 'body_claim' | 'proposed' }
```

Reviewer must differ from author. Review must follow the declared source reading, be at
most 30 days old, and not be in the future. Hypotheses require `proposed` scope; the
receipt never turns a proposed problem into an observed demand or a validated result.
Context tags must also have read sources. No currentness is inferred from `retrievedAt`:
v1 accepts historical-reference facts and proposed directions only, with no current-event
validity model.

Both decisions bind `id`, `packId`, `contentVersion`, `packHash`, explicit nonempty
`profileIds`, and `expectedPreviousHash` (`null` initially). A publish adds `reviews` and
`ui:{contractVersion:'evix-topic-publication-ui/1',fields:[...]}`. The fields must be exactly
`fact`, `hypothesis`, `geography`, `time`, `readscope`, `status`; a real UI must expose all
six before wiring this module. This contract declaration is not rendered-UI evidence.
A withdrawal instead adds a nonempty `reason` and must target the exact active content.

Decisions/receipts cannot be replayed; stale heads, cross-pack/version/hash approvals,
reused mutable content versions and silent draft-to-published bulk flips reject. Selecting
several profiles is possible only with an explicit ID list and all their item approvals.
Publishing a new content version replaces only its explicitly selected profiles. A later
explicit re-publication requires new receipt IDs and approvals within the time window.
Within one pack and catalog version, each **published selected** profile ID is permanently
bound to its county code, and each county code to that profile ID. A withdrawal does not
release either identity. A new version cannot create two active profiles for one county by
renaming an ID, or silently rebind the same ID to a different county with the same name.
Unselected draft profiles establish no identity. A different catalog version is a separate
review namespace: its release requires current canonical geography and complete new item
approvals. An old catalog reference is never treated as a current one or migrated silently.

History is self-hashed, chained and copied; no prior version or original draft is changed.
`freshTopicPublication(history)` returns only active published profiles with current known
geography. The outer `status:'published'` is release state; nested `profile.status:'draft'`
is retained source provenance. Withdrawn and never-published drafts are omitted. Old
catalog releases remain readable/retractable after rollout, but are omitted from fresh
recommendations until an explicit current-catalog release. Withdrawal does not require
new source approvals or a current catalog/UI capability, so disputed historical content
can be retracted. One ledger belongs to one pack, with at most 1,000 events per call;
long-term persistence/archival, an authenticated maintainer workflow and actual UI wiring
are separate integration work, not implemented here. At the 1,000-event boundary another
append rejects without changing history; it never returns a ledger its reader cannot
consume. Imported history also rechecks that each withdrawal targeted the exact then-active
content, even when the supplied event has a correctly recomputed hash.
All history entries are synchronously detached individually before the first hash await;
the whole ledger is not passed through the 2MB single-value encoder. Apply also captures
and validates its raw pack, author, source reads, decision and clock before awaiting
history. Caller additions/removals or nested edits during hashing cannot change that call.
