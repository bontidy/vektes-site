# Fee Model

Vektes v2 can charge a small protocol fee on each transfer, taken **in-kind from the asset being sent** — never in $VEK. Fees are tiered by the **sender's monthly transfer volume**, not by the size of any individual transfer, and are bounded on-chain by an immutable ceiling.

> **Current status: transfers are free.** Every fee tier is set to `0` on-chain today (fee-free launch). The tier *mechanism* documented here exists and can be activated later by the owner via `updateFeeTier`, up to the 1% ceiling. Until then `previewFee()` returns `0`.

---

## Fee Tiers

Tiers are keyed to a sender's **cumulative USD volume over a rolling ~30-day window** (`monthlyVolume`, reset every 30 days). The rate is stored as `feeBps` in **units of 0.001%** (so `5` = 0.005%).

| Tier | Sender's monthly volume (USD) | Standard rate | On-chain today | Fee on a $50K transfer at the standard rate |
|------|-------------------------------|---------------|----------------|---------------------------------------------|
| 0 | ≤ $10,000 | Free (0) | 0 | $0 |
| 1 | ≤ $100,000 | 0.005% (5) | 0 | $2.50 |
| 2 | ≤ $1,000,000 | 0.01% (10) | 0 | $5.00 |
| 3 | > $1,000,000 | 0.02% (20) | 0 | $10.00 |

The "standard rate" column is the intended schedule; **all four tiers are `0` on-chain** — the table describes what the owner can activate, not what is charged today.

> The tier is chosen by the **sender's accumulated monthly volume, including the current transfer**. Two identical $50K transfers can fall in different tiers depending on how much the sender has already moved this month. Volume is tracked even while rates are 0, so tiers are already meaningful.

---

## How Fees Are Calculated

1. The transfer amount is converted to a 6-decimal USD value via the token's Chainlink price feed (used **only for tiering**).
2. That value is added to the sender's monthly volume and the tier rate (`feeBps`) for the resulting volume is selected.
3. The fee is a straight percentage **of the asset being sent**: `fee = amount × feeBps / 100_000`.
4. The recipient receives **`amount − fee`**; the fee stays in the contract as `accruedFees[token]` once the transfer completes.

```
fee = amount * feeBps / 100_000        // in the transfer asset (USDC, USDT, ETH, …)
net = amount - fee                     // what the recipient receives
```

No $VEK price is read anywhere on the transfer path.

### Example (once tier 1 is active)

Sending 50,000 USDC while in tier 1 (0.005%): `fee = 50,000 × 0.00005 = 2.50 USDC`; the recipient receives 49,997.50 USDC.

### Fee-exempt tokens

The owner can flag a token **fee-exempt** (`feeExempt(token)`), which skips the oracle, the volume tally and the fee entirely. **$VEK is fee-exempt** — VEK-to-VEK transfers are always free and need no price feed.

---

## Fee Caps

Two caps protect the sender:

**1. Immutable protocol ceiling.** `MAX_FEE_BPS = 1000` (1%). `updateFeeTier` reverts `FeeExceedsCap` above it; no configuration can ever charge more than 1%.

**2. Per-call `maxFee`.** Every fee-bearing entrypoint takes a `maxFee` argument, **denominated in the transfer asset**:

```solidity
send(token, to, amount, txCode, settlementDate, maxFee);
sendNative(to, txCode, settlementDate, maxFee);                 // payable
sendWithPermit(..., maxFee, deadline, v, r, s);
createClaimable(token, amount, txCode, claimAddr, expiry, maxFee);
createClaimableNative(txCode, claimAddr, expiry, maxFee);        // payable
createCampaign(token, amountPerClaim, poolAmount, campaignKey, txCode, expiry, maxFee);
topUpCampaign(campaignKey, txCode, addAmount, maxFee);
claimAllowance(sender, recipient, txCode, maxFee);
```

If the computed fee would exceed `maxFee` the call reverts `FeeExceedsMax(fee, maxFee)`. **`maxFee` is a strict cap: `0` means "I accept no fee at all"** — it does *not* disable the cap. Two sensible values:

- `previewFee(sender, token, amount)` — the exact fee right now (safe to pass back; optionally add a little headroom), or
- `amount * 1000 / 100_000` — the 1% protocol ceiling, i.e. "never more than the contract could charge anyway". This is what the Vektes app uses.

The 5-argument `send` / 3-argument `sendNative` overloads apply no cap.

---

## Where Fees Go

Accrued in-kind fees sit in the contract under `accruedFees[token]` (separate from user escrow — the contract's balance always equals accrued fees plus held escrow). The owner sweeps them to the treasury with `withdrawFees(token, amount)`, which can send **only to `treasury()`** and only up to the accrued amount. The treasury's buy-and-burn of $VEK happens **off-chain**, from swept fees — nothing is burned inside the protocol contract.

---

## Previewing Fees

```typescript
// previewFee(sender, token, amount) — the sender is required (tiers are per-sender)
const fee = await vektes.previewFee(signer.address, USDC, ethers.parseUnits("50000", 6));
console.log("Fee:", ethers.formatUnits(fee, 6), "USDC"); // "0.0 USDC" while free

// Which tier applies to this sender right now
const [tier, bps] = await vektes.getCurrentTier(signer.address);
console.log(`Tier ${tier}, rate: ${Number(bps) / 1000}%`);
```

---

## Oracle

The protocol prices tokens in USD via Chainlink `AggregatorV3Interface` feeds registered per token by the owner with `setPriceFeed(token, feed, staleThreshold)`. Each feed has its **own staleness threshold** — an answer older than the threshold reverts the send (`StalePrice`). The oracle only ever affects **tiering**; the fee itself is a percentage of the sent asset, and a fee-exempt token needs no feed at all. Mainnet: ETH/USD (7200s), USDC/USD and USDT/USD (90000s).

---

## Fee Activation

The protocol launched **fee-free**. While tiers are `0` no fee is charged and nothing accrues, so the treasury's buy-and-burn stays dormant. Fees are turned on by the owner (the Gnosis Safe) by setting non-zero tiers via `updateFeeTier`, bounded by the 1% ceiling. There is **no fixed date** — activation is a governance decision, would be announced in advance, and is subject to the legal structuring of the protocol operator.

---

## Fee-Free Scenarios

No fee is charged when:
- All tiers are set to `0` (the current launch state), **or**
- The token is fee-exempt (e.g. $VEK), **or**
- The sender's monthly volume is within the free tier (tier 0), **or**
- The computed fee rounds to zero.
