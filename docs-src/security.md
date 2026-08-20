# Security

Vektes is designed with defense-in-depth. The protocol is independently audited, uses OpenZeppelin access-control and safety primitives, is non-upgradeable, and minimizes owner power to configuration only.

---

## Audit

| Auditor | Scope | Findings |
|---------|-------|----------|
| **CertiK** | Full protocol contract + VEK token | No critical or high-severity issues (remediations applied; e.g. per-recipient dedup, per-feed staleness, actual-balance accounting) |

Public report: [skynet.certik.com/projects/vektes](https://skynet.certik.com/projects/vektes).

The audit covered state-changing functions (`send`, `sendNative`, `claim`, `rejectTransfer`, `batchClaim`), fee calculation and oracle integration, access control and ownership, reentrancy, and settlement-date edge cases.

---

## Access Control

Ownership uses **OpenZeppelin `Ownable2Step`** (two-step transfer: `transferOwnership` then `acceptOwnership`), held by the Gnosis Safe:

```
Owner: 0xBdCDb466c70E21A985E7eA02Be6E838aD5c00207 (2-of-3 multisig)
```

### Owner-only functions (configuration only)

- `pause()` / `unpause()` — emergency circuit breaker for new sends
- `setPriceFeed(token, feed, threshold)` / `setStalePriceThreshold(token, threshold)` — oracle config
- `setTreasury(address)` — treasury fee recipient
- `setBurnPercentage(uint256)` — burn/treasury split (0–100)
- `setTokenSupport(token, bool)` — supported-token allowlist
- `setFeeToken(address)` — the fee token ($VEK)
- `updateFeeTier(index, threshold, feeBps)` — fee-tier schedule
- `transferOwnership` / `acceptOwnership`

> No owner function can access, redirect, or freeze user funds, change a transfer's recipient, or block a claim on a settled transfer.

### What the Owner Can / Cannot Do

| Action | Possible? |
|--------|-----------|
| Steal or move locked user funds | ❌ No |
| Change a transfer's recipient/amount | ❌ No |
| Prevent claims/rejections after settlement | ❌ No (those paths are not pausable) |
| Mint VEK / inflate supply | ❌ No (token has no mint function) |
| Upgrade or swap contract logic | ❌ No (immutable, no proxy) |
| Pause **new** sends | ✅ Yes (emergency) |
| Update fee tiers / burn split / treasury | ✅ Yes (configuration) |
| Add/remove supported tokens & price feeds | ✅ Yes (configuration) |

> **Note on fee tiers:** these are **configurable**, not immutable — the owner can change rates and thresholds via `updateFeeTier`. The protocol launched with all tiers at `0` (free). What is *immutable* is the contract logic itself.

---

## Reentrancy Protection

All fund-moving functions carry OpenZeppelin's `nonReentrant` guard and follow checks-effects-interactions:

```
send() / sendNative()  → nonReentrant ✓
claim() / batchClaim() → nonReentrant ✓
rejectTransfer()       → nonReentrant ✓
```

State (dedup flags, `claimed`/`cancelled`, counters) is updated **before** any external token/native transfer. For inbound ERC-20s the contract credits the **actual balance received** (balance delta), so accounting stays correct and solvent; fee-on-transfer/rebasing tokens are additionally kept off the allowlist by policy.

---

## Pausable

Implements OpenZeppelin `Pausable`:

- **When paused:** `send()` / `sendNative()` are disabled — no new transfers.
- **When paused:** `claim()`, `batchClaim()`, and `rejectTransfer()` **remain active** — funds already in the contract can always be withdrawn or refunded.

A pause can never trap locked funds.

---

## Immutable Deployment

The protocol contract is **not upgradeable** — no proxy, no `delegatecall`, no implementation swap. The address and logic are permanent, so users can verify exactly the code that governs their funds.

---

## Oracle Safety

Fees are priced through Chainlink `AggregatorV3Interface` feeds registered per token. Each feed has its **own staleness threshold**; an answer older than the threshold, non-positive, or from an unset feed reverts the transfer (`StalePrice` / `InvalidPrice` / `PriceFeedNotSet`). Oracle issues can only block or misprice a *fee* — they never affect the transfer amount, which is delivered in full.

---

## Fund Safety

| Scenario | Outcome |
|----------|---------|
| Protocol paused | Claims/rejections still work; only new sends are blocked. |
| Owner key compromised | Attacker can only reconfigure/pause. Cannot access user funds, change recipients, or mint VEK. |
| Oracle stale/manipulated | Fee calc reverts or is bounded; transfer amounts unaffected; sender's `maxFeeVek` caps exposure. |
| Malicious/odd ERC-20 | Reentrancy guard + actual-balance accounting; non-standard tokens kept off the allowlist. |
| Recipient loses keys (scheduled) | Funds stay locked; the sender cannot reclaim (irrevocability) — but the recipient could still `rejectTransfer` to refund the sender if they retain access. |

---

## Best Practices for Integrators

1. **Verify addresses** against [Contract Addresses](./contracts.md).
2. **Check `supportedTokens(token)`** before sending (or handle `TokenNotSupported`).
3. **Quote with `previewFee(sender, token, amount)`** and pass it as `maxFeeVek` for slippage safety.
4. **Use `isClaimable(sender, recipient, code)`** before claiming to avoid reverts.
5. **Watch `Paused`/`Unpaused`** and halt new sends in your UI when paused.
6. Prefer `permit` (VEK is ERC-2612) over unlimited approvals where possible.

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
| OpenZeppelin Contracts | 5.x | `Ownable2Step`, `ReentrancyGuard`, `Pausable`, `SafeERC20`, `Math` |
| Chainlink `AggregatorV3Interface` | — | USD price oracles |
| Gnosis Safe | — | 2-of-3 multisig ownership |
