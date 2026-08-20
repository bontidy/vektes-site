# Fee Model

Vektes can charge a small protocol fee on each transfer, paid in **$VEK** and split between burn and treasury. Fees are tiered by the **sender's monthly transfer volume** — not by the size of any individual transfer.

> **Current status: transfers are free.** Every fee tier is set to `0` on-chain today (the protocol launched fee-free). The tier *mechanism* documented here exists and can be activated later by the owner via `updateFeeTier`. Until then, `previewFee()` returns `0` and no $VEK is required to transfer.

---

## Fee Tiers

Tiers are keyed to a sender's **cumulative volume over a rolling ~30-day window** (`monthlyVolume`, reset every 30 days). The rate is stored as `feeBps` in **units of 0.001%** (so `5` = 0.005%).

| Tier | Sender's monthly volume (USD) | Intended rate | Fee on a $50K transfer |
|------|-------------------------------|---------------|------------------------|
| 0 | ≤ $10,000 | Free (0) | $0 |
| 1 | ≤ $100,000 | 0.005% (5) | $2.50 |
| 2 | ≤ $1,000,000 | 0.01% (10) | $5.00 |
| 3 | > $1,000,000 | 0.02% (20) | $10.00 |

The "intended rate" column is the standard schedule (also shown on vektes.com). **All four tiers are currently `0` on-chain** — the table describes what the owner can activate, not what is charged today.

> The tier is chosen by the **sender's accumulated monthly volume**, including the current transfer. Two identical $50K transfers can fall in different tiers depending on how much the sender has already moved this month.

---

## How Fees Are Calculated

1. The transfer `amount` is converted to a 6-decimal USD value via the token's Chainlink price feed (`_toUsd6`).
2. That value is added to the sender's monthly volume, and the tier rate (`feeBps`) for the resulting volume is selected.
3. Fee in USD = `usdValue × feeBps / 100_000` (6-decimal USD).
4. The USD fee is converted to **$VEK** via the VEK/USD feed.
5. The $VEK fee is pulled from the sender at send time, separately from the transfer amount — **the recipient always receives the full transfer amount**.

```
feeUsd6 = usdValue6 × feeBps / 100_000
feeVek  = feeUsd6 → VEK   (via the VEK/USD Chainlink feed)
```

### Example (once tier 1 is active)

Sending 50,000 USDC while in tier 1 (0.005%):
- `feeUsd = $50,000 × 0.00005 = $2.50`
- If VEK = $0.25 → fee = **10 VEK**

---

## Fee Cap (slippage protection)

There is **no fixed maximum fee**. Instead, the sender can pass a **per-transaction cap** via the 6-argument overloads:

```solidity
send(token, to, amount, txCode, settlementDate, maxFeeVek);
sendNative(to, txCode, settlementDate, maxFeeVek);   // payable
```

If the computed $VEK fee would exceed `maxFeeVek`, the transaction reverts with `FeeExceedsMax(feeVek, maxFeeVek)`. Pass `maxFeeVek = 0` to disable the cap. Quote the value with `previewFee(sender, token, amount)` and pass it (optionally with a little headroom) as the cap — a moved or manipulated VEK price then can never pull more VEK than the sender approved.

---

## Fee Split

When a fee is charged, it is split immediately on-chain by `burnPercentage` (currently **50**, owner-adjustable 0–100):

| Destination | Share | Mechanism |
|-------------|-------|-----------|
| **Burn** | `burnPercentage`% (50%) | Sent to `0x…dEaD` (`BURN_ADDRESS`) |
| **Treasury** | remainder (50%) | Sent to `treasury()` (the Gnosis Safe) |

---

## Fee Payment Requirements

- Fees apply **only above the free tier**. While all tiers are `0` (today), no VEK is needed at all.
- When a fee applies, the sender must hold enough **$VEK** and have approved the protocol to spend it — otherwise the send reverts.
- Every transferred token (and native ETH, and VEK when fees are on) must have a registered Chainlink feed that is not stale, or the send reverts (`PriceFeedNotSet` / `StalePrice` / `InvalidPrice`).

> **Tip:** call `previewFee(sender, token, amount)` before sending to show the exact fee and to set `maxFeeVek`.

---

## Previewing Fees

```typescript
// previewFee(sender, token, amount) — note the sender is required (tiers are per-sender)
const feeInVek = await vektes.previewFee(
  signer.address,
  USDC_ADDRESS,
  ethers.parseUnits("50000", 6) // 50,000 USDC
);
console.log("Fee:", ethers.formatUnits(feeInVek, 18), "VEK"); // "0.0 VEK" while free

// Which tier applies to this sender right now
const [tier, bps] = await vektes.getCurrentTier(signer.address);
console.log(`Tier ${tier}, rate: ${Number(bps) / 1000}%`);
```

---

## Oracle

The protocol prices tokens (and VEK) in USD via a Chainlink-compatible `AggregatorV3Interface`. Each feed is registered per token by the owner with `setPriceFeed(token, feed, staleThreshold)`, and each has its **own staleness threshold** — an answer older than the threshold reverts the transfer (`StalePrice`). This protects fee calculation from stale or manipulated prices. Feeds and thresholds are owner-managed via the multisig.

---

## Fee Activation

The protocol launched **fee-free** — all tiers are `0` today. While fees are `0`:

- No protocol fee is charged, and no $VEK is required to transact.
- The fee-burn mechanism is **dormant** — nothing is burned or routed to the treasury, because that only happens when a fee is actually collected.
- $VEK's protocol-fee utility is therefore **latent** until fees are switched on.

Fees are turned on by the protocol owner (the Gnosis Safe, moving toward on-chain governance) by setting non-zero tiers via `updateFeeTier`. The standard schedule above (0.005% / 0.01% / 0.02% by monthly volume) can be activated once the protocol has meaningful, sustained settlement usage. There is **no fixed date** — activation is a governance decision and would be announced in advance.

> **Activation criteria (to be finalized by governance):** the specific trigger — for example a sustained settlement-volume or active-user threshold, or an on-chain governance vote — is still being set and will be published here once decided. Until then, **transfers are completely free.**

---

## Fee-Free Scenarios

No fee is charged when:
- All tiers are set to `0` (the current launch state), **or**
- The sender's monthly volume is within the free tier (tier 0), **or**
- The computed fee rounds to zero.

> There is **no per-address fee whitelist** in the contract. Fee exemptions, if ever offered, would be implemented by the tier schedule / governance — not a `whitelistSender` function.
