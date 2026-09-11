# Security

Vektes is designed with defense-in-depth. The protocol is independently audited, uses OpenZeppelin access-control and safety primitives, is non-upgradeable, and minimizes owner power to configuration only.

---

## Audits

| Contract | Auditor | Audited tag | Result |
|----------|---------|-------------|--------|
| **Vektes Protocol v2** (`VektesProtocolV2`, `0x1340…Ad34`) | **CertiK** | `audit-2.6.0` (final 2026-09-11) | 7 findings — 0 Critical, 1 Major, 4 Medium, 1 Minor, 1 Centralization. **All 6 code findings resolved**; the centralization item (owner privileges on a multisig, no timelock yet) acknowledged. |
| Vektes Protocol v1 (`VektesProtocol`, `0xd055…E8B7`) + VEK token + vesting | **CertiK** | `audit-1.1.0` (final 2026-07-30) | 0 Critical / 0 Major; all code findings resolved. |

Public profile: [skynet.certik.com/projects/vektes](https://skynet.certik.com/projects/vektes). The v2 review covered the permissionless release model, deliver-or-credit payouts, in-kind fees and caps, claim-by-link signature binding, campaign and recurring-allowance accounting, access control, reentrancy and settlement-date edge cases. Dispositions are listed in `SECURITY.md` of the [contracts repository](https://github.com/bontidy/vektes-contracts).

---

## Access Control

Ownership uses **OpenZeppelin `Ownable2Step`** (two-step transfer: `transferOwnership` then `acceptOwnership`), held by the Gnosis Safe:

```
Owner: 0xBdCDb466c70E21A985E7eA02Be6E838aD5c00207 (2-of-3 multisig)
```

### Owner-only functions (configuration only)

- `pause()` / `unpause()` — circuit breaker for **creating** new transfers, links, campaigns and allowances
- `setPriceFeed(token, feed, threshold)` / `setStalePriceThreshold(token, threshold)` — oracle config
- `setTreasury(address)` — the only destination fees can be swept to
- `setTokenSupport(token, bool)` — supported-token allowlist
- `setFeeExempt(token, bool)` — fee-exempt tokens (e.g. $VEK)
- `updateFeeTier(index, threshold, feeBps)` — fee-tier schedule, bounded by the immutable `MAX_FEE_BPS` (1%)
- `withdrawFees(token, amount)` — sweep **accrued fees only** to the treasury
- `transferOwnership` / `acceptOwnership`

> No owner function can access, redirect, or freeze escrowed user funds, change a transfer's recipient, block a release or rejection, or take more than the accrued fees.

### What the Owner Can / Cannot Do

| Action | Possible? |
|--------|-----------|
| Steal or move escrowed user funds | ❌ No (`withdrawFees` spends only the `accruedFees` accounting) |
| Change a transfer's recipient / amount / date | ❌ No |
| Prevent releases, rejections, claims, reclaims, withdrawals or allowance collection | ❌ No (those paths are not pausable) |
| Set a fee above 1% | ❌ No (`MAX_FEE_BPS` is a constant) |
| Mint VEK / inflate supply | ❌ No (token has no mint function) |
| Upgrade or swap contract logic | ❌ No (immutable, no proxy) |
| Pause **new** sends / links / campaigns / allowances | ✅ Yes (emergency) |
| Update fee tiers (≤ 1%) / treasury / fee-exempt flags | ✅ Yes (configuration) |
| Add/remove supported tokens & price feeds | ✅ Yes (configuration) |

> **Note on fee tiers:** these are **configurable**, not immutable — the owner can change rates and thresholds via `updateFeeTier`, up to the 1% ceiling. The protocol launched with all tiers at `0` (free). What is *immutable* is the contract logic itself and the ceiling.

---

## Reentrancy Protection

All fund-moving functions carry OpenZeppelin's `nonReentrant` guard and follow checks-effects-interactions:

```
send() / sendWithPermit() / sendNative()          → nonReentrant ✓
release() / releaseMany() / reject() / withdraw()  → nonReentrant ✓
createClaimable*() / claimTo() / reclaim()         → nonReentrant ✓
createCampaign() / topUpCampaign() / claimCampaign() / reclaimCampaign() → nonReentrant ✓
claimAllowance()                                   → nonReentrant ✓
```

State (dedup flags, `released` / `rejected` / `claimed` flags, counters, credits) is updated **before** any external token/native transfer. For inbound ERC-20s the contract credits the **actual balance received** (balance delta), so accounting stays correct and solvent; fee-on-transfer/rebasing tokens are additionally kept off the allowlist by policy. The solvency invariant `balance == accruedFees + Σ held escrow + Σ credits` is exercised by randomized tests.

---

## Deliver-or-credit (no stranded funds)

Outbound payouts that resolve an escrow (`release`, `releaseMany`, `reject`, `reclaim`, `reclaimCampaign`) are attempted through a self-call inside `try/catch`. If the push fails, native ETH is wrapped to WETH and delivered; an undeliverable ERC-20 is credited to the beneficiary for `withdraw(token, to)`. Consequences:

- A single bad recipient can never permanently lock its own escrow, nor revert anyone else's release in a batch.
- A **contract** recipient must be able to hold WETH or call `withdraw` — choosing a compatible destination is the sender's responsibility.
- The protocol contract itself is rejected as a recipient or payout address (`InvalidRecipient`).

---

## Pausable

Implements OpenZeppelin `Pausable`:

- **When paused:** `send`, `sendWithPermit`, `sendNative`, `createClaimable`, `createClaimableNative`, `createCampaign`, `topUpCampaign` and `createAllowance` are disabled — nothing new can be created.
- **When paused:** `release`, `releaseMany`, `reject`, `shortenSettlementDate`, `withdraw`, `claimTo`, `reclaim`, `claimCampaign`, `reclaimCampaign`, `claimAllowance`, `cancelAllowance` and `extendAllowance` **remain active** — funds already committed can always exit.

A pause can never trap funds.

---

## Immutable Deployment

The protocol contract is **not upgradeable** — no proxy, no `delegatecall`, no implementation swap. The address and logic are permanent, so users can verify exactly the code that governs their funds. v2 is a separate deployment from v1; neither can affect the other.

---

## Claim-link signature safety

`claimTo` and `claimCampaign` require an EIP-712 signature by the link's key over `Claim(sender, claimAddr, txCode, payoutTo)`, with the domain bound to the chain id and contract address. Because the **payout address is inside the signed message**, a signature observed in the mempool cannot be replayed to a different destination, and a signature for one contract or chain is useless on another. Claims are refused at/after `expiry`, so a claim and the sender's reclaim can never race.

---

## Oracle Safety

Fees are tiered through Chainlink `AggregatorV3Interface` feeds registered per token. Each feed has its **own staleness threshold**; an answer older than the threshold, non-positive, or from an unset feed reverts the send (`StalePrice` / `InvalidPrice` / `PriceFeedNotSet`). The oracle only influences **which tier** applies — the fee is a percentage of the sent asset, bounded by the 1% ceiling and the caller's `maxFee`. Fee-exempt tokens bypass the oracle entirely.

---

## Fund Safety

| Scenario | Outcome |
|----------|---------|
| Protocol paused | Releases, rejections, claims, reclaims, withdrawals and allowance collection still work; only creation is blocked. |
| Owner key compromised | Attacker can only reconfigure (fees ≤ 1%, feeds, allowlist), pause creation, or sweep already-accrued fees to the treasury. Cannot touch escrow, change recipients, or mint VEK. |
| Oracle stale/manipulated | Sends revert or the tier is wrong within the 1% ceiling and the sender's `maxFee`; escrowed amounts are unaffected. |
| Malicious/odd ERC-20 | Reentrancy guard + actual-balance accounting; non-standard tokens kept off the allowlist. |
| Recipient can't receive the payout | Delivered as WETH (ETH) or credited for `withdraw` (ERC-20). Never stuck, never reverts others. |
| Recipient loses keys (scheduled) | Anyone can still release to that address; the sender cannot reclaim (irrevocability). |
| Lost claim link | The sender reclaims after `expiry`. Before expiry only the link holder can claim. |

---

## Best Practices for Integrators

1. **Verify addresses** against [Contract Addresses](./contracts.md).
2. **Check `supportedTokens(token)`** before sending (or handle `TokenNotSupported`).
3. **Always pass a real `maxFee`** — `previewFee(sender, token, amount)` or the 1% ceiling `amount * 1000 / 100000`. Never `0`.
4. **Use `isReleasable(sender, recipient, code)`** before releasing to avoid reverts; use `releaseMany` for batches.
5. **Handle `PayoutDeferred`** — surface credited balances (`withdrawable(beneficiary, token)`) and a `withdraw` action to your users.
6. **Watch `Paused`/`Unpaused`** and halt new sends in your UI when paused.
7. Prefer `sendWithPermit` (USDC and other ERC-2612 tokens) over unlimited approvals; approve exact amounts otherwise.

---

## Responsible Disclosure

Found a vulnerability? Please disclose responsibly:
- **Do not** disclose publicly before a fix is deployed.
- Contact the team via the official channels on vektes.com.
- Bug-bounty rewards are available for valid findings.

---

## Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| OpenZeppelin Contracts | 5.x | `Ownable2Step`, `ReentrancyGuard`, `Pausable`, `EIP712`, `ECDSA`, `SafeERC20`, `IERC20Permit` |
| Chainlink `AggregatorV3Interface` | — | USD price oracles (tiering) |
| WETH9 | `0xC02aaA39…6Cc2` | Native-ETH fallback delivery |
| Gnosis Safe | — | 2-of-3 multisig ownership |
