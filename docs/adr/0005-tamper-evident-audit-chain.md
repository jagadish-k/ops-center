# ADR-0005: Tamper-Evident SHA-256 Audit Chain

## Status

Accepted — clarifies the WORM guarantee level for the Audit Chain described in
`docs/AUDIT-LOGGER.md`, `docs/LEDGER-VERIFIER.md`, `docs/FORENSIC-INSPECTOR.md`,
and PRD §2.4 / §8.

## Context

The PRD (§2.4, §8) and supporting docs describe a **cryptographically chained
WORM (Write-Once-Read-Many) forensic ledger** where every state mutation
generates an immutable audit entry, chained via SHA-256:

```
Hash_n = SHA-256(Data_n ∥ Hash_{n-1})
```

The intent is to establish a mathematical chain of custody that holds up under
legal review or insurance audit.

However, the implementation as documented has two gaps:

1. **Client-computed hashes.** `docs/AUDIT-LOGGER.md` computes the SHA-256 chain
   on the **client** and writes it to storage. The client holds
   `fallbackLastKnownHash`, so a malicious client could write an entirely fresh
   fraudulent chain with self-consistent hashes. True WORM requires server-side
   (or DB-trigger) hash computation.
2. **Overwrite-capable storage.** Even with server-side hashing, the chosen
   storage (Netlify Blobs, per ADR-0002) is a key-value store where blob keys
   **can be overwritten** by anyone with API access. There is no native
   object-lock / retention policy. The SHA-256 chain is therefore
   **tamper-_evident_** (a break is detectable on verification) but not
   **tamper-_proof_** (an overwrite cannot be prevented at the storage layer).

For a true legal-grade WORM, one would need object-storage with retention
policies (e.g., AWS S3 Object Lock, Google Cloud Storage Bucket Lock).

Additionally, `docs/FORENSIC-INSPECTOR.md` contains a **stub verifier** that
only checks `cryptographicHash.length === 64` — it does not actually recompute
the chain. The real verifier in `docs/LEDGER-VERIFIER.md` does proper
recomputation but is not wired into the inspector component.

## Decision

Adopt **tamper-evident** (not tamper-proof) WORM for the initial build:

1. **Hash computation moves server-side.** The Netlify Function that handles
   mutations (`mutations.ts`) computes the SHA-256 chain entry — not the
   client. The client sends only the state delta; the server resolves the
   prior hash, computes the new hash, and writes the entry.
2. **Storage in Netlify Blobs** at key `audit/{tenantId}/{eventId}`. Append-only
   by convention (the mutation function only ever creates, never updates or
   deletes audit keys).
3. **Verification via real chain walk.** The `verify-ledger.ts` endpoint uses
   the proper `verifyLedgerSequenceIntegrity()` algorithm from
   `docs/LEDGER-VERIFIER.md` — not the length-check stub. It fetches the blob
   range for a tenant, sorts by timestamp, recomputes each hash, and reports
   any break.
4. **Documented limitation.** The system detects tampering after the fact but
   cannot prevent an attacker with Blob API access from overwriting an entry.
   The chain break would be visible on the next verification scan. This is
   sufficient for operational audit; **not sufficient for legal-grade
   forensics** without upgrading to true immutable storage.

### Future upgrade path

If legal-grade WORM becomes a requirement, add a nightly mirror job that copies
new audit entries to an object store with retention policies (AWS S3 Object
Lock or GCS Bucket Lock). This is deferred — see build plan "Deferred / Future."

## Consequences

**Positive:**

- Pragmatic, shippable audit trail without external object-storage dependency.
- Server-side hashing closes the client-fraud gap.
- Chain breaks are immediately visible in the `AuditTimelineInspector` UI.

**Negative:**

- **Not tamper-proof.** An attacker with Netlify Blob API access can overwrite
  an audit entry. The break is detectable but the original data may be lost.
- **No retention lock.** Old audit entries can be deleted by an API call. Must
  rely on access-control discipline + monitoring.
- **Compliance caveat.** If a legal or insurance audit demands proof that data
  was _never_ modifiable, this system cannot provide it. The upgrade path
  (object lock) must be taken first.

**Supersedes:** The client-side `commitForensicAuditLog` in
`docs/AUDIT-LOGGER.md` (hash computation moves server-side) and the stub
verifier in `docs/FORENSIC-INSPECTOR.md` (replaced by real chain walk).
