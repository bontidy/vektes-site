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
  `reclaimCampaign`), **§12 allowances** (`createAllowance`/`claimAllowance`/`cancelAllowance`/`extendAllowance`).
  New events (`TransferReleased`, `AllowanceCreated/Claimed/Cancelled/Extended`, …) and errors.
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
# Recurring Allowance — Crypto Autopay (Card / Direct-Debit)

A **recurring allowance** is a fixed, per-period charge to a **named recipient** — a crypto **card-on-file /
direct-debit** subscription. The customer (sender) authorises once; the merchant (recipient) **charges each
period** by pulling `amountPerPeriod` from the sender's wallet via a standing ERC-20 approval — no funds are
locked up front. Collection is **best-effort and resumable**: it succeeds while the sender keeps enough balance
+ approval, and a declined cycle simply retries next time. It is **debit, not credit** (funds must exist; no
chargebacks) and **ERC-20 only** (native ETH has no `transferFrom`).

Card-style features fall out of the parameters: **charge upfront or scheduled**, **free trial** (a future
start), **fixed term + renew**, **cancel anytime**.

---

## Create

`createAllowance(token, recipient, amountPerPeriod, periodLength, startTime, endTime, maxArrears, txCode)`

- **Sender-only** — the caller becomes the funder. The **recipient is fixed here and can never be changed.**
- Records the schedule; **locks no funds.** The sender must separately `approve()` the protocol for `token`.
- `startTime` — when the **first** charge unlocks. `0` = now (**charge immediately**); a future time schedules
  it (a future start = a **free trial**); each later period unlocks one `periodLength` after.
- `endTime` — **required** hard end date (must be after `startTime`; the app defaults it to ~1 year). No period
  accrues past it. The sender can **extend** it later to renew.
- `maxArrears` — grace window (**must be ≥ 1**): the max unclaimed periods ever claimable at once. Older
  uncollected cycles **lapse**, so a long-dormant order can never be drained in bulk on a later windfall.
  1 = strict use-it-or-lose-it; 3 = up to three recent missed cycles recoverable.
- `txCode` — unique per (sender, recipient), so one sender can run several allowances to the same payee.

## Charge (claim)

`claimAllowance(sender, recipient, txCode)` — **recipient-only.**

Collects every whole period claimable since the last charge (recent arrears included, up to `maxArrears`) in
one call; a period can never be charged twice. **Best-effort & resumable:** it collects as many whole periods
as the sender can currently cover; if the sender is short, it takes what it can and **retries next cycle** —
billing keeps running (no freeze). Reverts `NothingDue` if nothing new is claimable, or `FunderUnfunded` (no
state change) if not even one period is affordable right now — retry later.

## Extend (renew)

`extendAllowance(recipient, txCode, newEndTime)` — **sender-only.** Pushes the end date out (must be strictly
later; blocked after cancel). Extending a lapsed order resumes it, with the gap still bounded by `maxArrears`.

## Cancel

`cancelAllowance(recipient, txCode)` — **sender-only, hard stop.** It terminates the order and **forfeits every
unclaimed period** (arrears included): after cancel, `claimAllowance` reverts. The payment is treated as an
advance for services still to be rendered, so the recipient's protection is to **charge promptly**. (Reaching
the natural end date, by contrast, preserves the last `maxArrears` earned cycles.)

## Preview

- `previewAllowanceClaim(sender, recipient, txCode)` → `(periodsDue, grossAmount)` — the currently claimable
  amount (does not check whether the sender has the funds/approval to cover it).
- `getAllowance(sender, recipient, txCode)` → the full schedule.

---

## Good to know

- **Debit, not credit; no chargebacks.** Funds must exist in the sender's wallet at charge time; there is no
  credit line and no dispute/refund path (settlement is final).
- **Unclaimed pay is revocable.** Collection depends on the sender staying funded + approved; older uncollected
  cycles lapse via `maxArrears`, and a sender **cancel** forfeits everything unclaimed. Charge promptly.
- **Fees.** While the protocol is fee-free (launch), charges cost no protocol fee. When fees are active, the
  in-kind fee is taken from the collected amount, attributed to the funder — the recipient receives the net.
- **ERC-20 only**, standard tokens (the same curated allowlist as transfers). Fixed amount only (no variable /
  usage-based billing today).
```

---

*This checklist and the §12 page live on `v2-docs-draft`. Merge to `main` (and regenerate `/docs`) only at v2 launch.*
