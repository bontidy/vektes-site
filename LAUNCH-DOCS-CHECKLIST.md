# v2 launch — docs & site update checklist

**Status:** DRAFT on branch `v2-docs-draft` (not published; GitHub Pages serves only `main`).
**Execute when:** v2 has cleared the CertiK re-audit (tag `audit-2.1.0`) **and** is deployed to mainnet.
**Why not now:** the detailed `/docs` API pages depend on the final **deployed v2 address** and any
signature changes the audit might force. Rewriting them before deploy risks drift/rework — so this branch
holds the *ready* pieces + this plan, and the full `/docs` rewrite happens at launch against the final,
audited, deployed contract.

Fill-ins needed at launch: `{{V2_ADDRESS}}`, verified-source Etherscan link, final ABI.

---

## 1. Marketing page — `features.html`  ✅ done on this branch
- Added the **§12 · Recurring allowances** cell to the "New in v2" grid, and to the page meta description.
- Note: `features.html` on `main` **already publicly previews v2** (§1–§11). The §12 cell just completes it,
  so this one small change is safe to publish on its own ahead of the full docs rewrite if desired.

## 2. `/docs` API reference — rewrite for v2 at launch
Currently every `docs-src/*.md` describes the **live v1** contract (correct today). At v2 deploy, rewrite for
the v2 model. Per-page deltas:

- **README.md / overview** — v2 is the recommended contract; v1 kept for legacy/reference. New address.
- **quick-start.md** — send → **`release`** (permissionless, replaces `claim`); note in-kind fee (no $VEK needed).
- **protocol-reference.md** — full v2 surface: `release`/`releaseMany`, `reject` (strictly-before-date),
  `sendWithPermit`, `shortenSettlementDate`, `feeExempt`, `withdrawFees`/`accruedFees`, claim-by-link
  (`createClaimable`/`claimTo`/`reclaim`), campaigns (`createCampaign`/`topUpCampaign`/`claimCampaign`/
  `reclaimCampaign`), **§12 allowances** (`createAllowance`/`claimAllowance`/`cancelAllowance`). New events
  (`TransferReleased`, `AllowanceCreated/Claimed/Cancelled/Frozen`, …) and errors.
- **fee-model.md** — switch the primary model to **in-kind fee** (asset being sent, not $VEK) + off-chain
  buy-and-burn; the `feenote` in features.html already states this correctly and can be mirrored.
- **integration-guide.md** — watch `TransferReleased` (not `TransferClaimed`); keeper `releaseMany`; permit flow.
- **contracts.md** — v2 address `{{V2_ADDRESS}}`, verified source, supported tokens; keep v1 address as legacy.
- **security.md** — CertiK v2 (audit-2.1.0) result; unchanged owner model (2-of-3 Safe, no Timelock this round).
- **faq.md** — claim→release, fee-in-asset (not $VEK), + new "recurring allowance / claim-by-link / airdrop" Q&As.
- **build-docs.js** — add the new `recurring-allowance` page (below) to the `PAGES` array; regenerate; commit HTML.

## 3. dApp — `app.vektes.com` (VektesApp/index.html)
- Point contract address/ABI at v2.
- Replace claim UX with permissionless **release**; show in-kind fee (no $VEK-to-pay prompt).
- New flows: **recurring allowance** (create/claim/cancel), **send-by-link** (create/claim), **airdrop campaign**.
- Cloudflare purge after deploy (`scripts/cf-purge.js everything`).

## 4. Deploy hygiene
- vektes.com is DNS-only GitHub Pages (no CF purge); a `main` push publishes it.
- Verify clean URLs still resolve after adding pages; update `sitemap.xml`.

---

## READY-TO-PASTE: `docs-src/recurring-allowance.md` (§12)

```markdown
# Recurring Allowance (Standing Order)

A **recurring allowance** is a fixed, per-period payment to a **named recipient** who **pulls** it each
period — like a salary, stipend, or subscription. It is a **pull-from-sender standing order**: no funds are
locked up front. Each period the recipient withdraws `amountPerPeriod` directly from the sender's wallet via
the sender's standing ERC-20 approval to the protocol. Collection is therefore **best-effort** — it succeeds
only while the sender keeps enough balance and approval, exactly like a bank standing order / direct debit.
**ERC-20 only** (native ETH has no `transferFrom`).

---

## Create

`createAllowance(token, recipient, amountPerPeriod, periodLength, startTime, endTime, txCode)`

- **Sender-only** — the caller becomes the funder. The **recipient is fixed here and can never be changed.**
- Records the schedule; **locks no funds.** The sender must separately `approve()` the protocol for `token`.
- `startTime` — when the **first** period unlocks. `0` = now (**immediate first pull**); a future timestamp
  delays the first pull to that date; a past timestamp makes several periods claimable at once. Each later
  period unlocks one `periodLength` after.
- `endTime` — optional. `0` = **open-ended** (pulls until the sender cancels). If set (must be after
  `startTime`), accrual stops there: the recipient can never pull a period past `endTime` (periods unlocked
  before it stay claimable).
- `txCode` — unique per (sender, recipient), so one sender can run several allowances to the same payee.

## Claim

`claimAllowance(sender, recipient, txCode)` — **recipient-only.**

Pulls every whole period accrued since the last claim (arrears included) in one call. A period can never be
claimed twice. **Best-effort:** it pays as many whole periods as the sender can currently cover; if the
sender can't cover every owed period, the pull is *short* — it pays what it can and then **freezes** the
standing order (a missed payment ends the forward commitment): the already-unlocked arrears remain claimable,
but **no future period will ever accrue.**

- Reverts `NothingDue` if no new whole period has accrued.
- A fully-unfunded claim freezes and returns without paying; a *later* still-unfunded claim reverts
  `FunderUnfunded`.

## Cancel

`cancelAllowance(recipient, txCode)` — **sender-only, hard stop.** It terminates the order and **forfeits every
unclaimed period** (arrears included): after cancel, `claimAllowance` reverts and the recipient can claim
nothing more. The payment is treated as an advance for services still to be rendered, so the recipient's only
protection is to **claim promptly** — anything unclaimed at cancel is lost. (This differs from a *funding
shortfall*, which freezes future accrual but keeps already-unlocked arrears claimable.)

## Preview

- `previewAllowanceClaim(sender, recipient, txCode)` → `(periodsDue, grossAmount)` — the *entitlement*
  (does not check whether the sender currently has the funds/approval).
- `getAllowance(sender, recipient, txCode)` → the full schedule.

---

## Good to know

- **Not a funds guarantee, and unclaimed pay is revocable.** Because funds are pulled from the sender, arrears
  are only collectable while the sender stays funded and approved. A single missed/underfunded pull
  **permanently** stops future accrual (arrears preserved), and the sender can **cancel to forfeit everything
  unclaimed**. Claim promptly.
- **Fees.** While the protocol is fee-free (launch), claims cost no protocol fee. When fees are active, the
  in-kind fee is taken from the pulled amount, attributed to the funder — the recipient receives the net.
- **ERC-20 only**, standard tokens (the same curated allowlist as transfers).
```

---

*This checklist and the §12 page live on `v2-docs-draft`. Merge to `main` (and regenerate `/docs`) only at v2 launch.*
