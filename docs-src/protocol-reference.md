# Protocol Reference

Complete function reference for **Vektes Protocol v2** (`VektesProtocolV2`, immutable).

**Contract:** `0x1340cf73cbF9d62eDfC7ECCea49aCdbA420EAd34` (Ethereum mainnet) — [verified source](https://etherscan.io/address/0x1340cf73cbF9d62eDfC7ECCea49aCdbA420EAd34#code). CertiK-audited at tag `audit-2.6.0` (final report 2026-09-11, 0 Critical / 0 Major). The previous contract is documented in the [v1 reference](./protocol-reference-v1.md).

> **Key model:** every record is identified by the tuple **`(sender, counterparty, txCode)`** — the on-chain key is `keccak256(abi.encodePacked(sender, counterparty, txCode))`. For a transfer the counterparty is the recipient; for claim-by-link it is the claim key's address; for a campaign the campaign key; for a recurring allowance the payee. All record types share one `usedCodes` namespace, so a `txCode` is unique **per sender→counterparty pair** across every flow.
>
> **Instant vs. scheduled:** if `settlementDate <= block.timestamp` (e.g. `0`), the transfer is **instant** — the net amount is delivered to the recipient inside the same transaction and **no record is stored** (only `InstantTransfer` is emitted). If `settlementDate` is in the future, the transfer is **scheduled** — the escrow is held until the date, after which **anyone** may `release()` it to the fixed recipient, and until release the recipient may `reject()` it.
>
> **Fees are in-kind:** any protocol fee is taken from the asset being sent (the recipient receives `amount − fee`); nothing is ever charged in $VEK. Every fee-bearing call takes a **`maxFee`** cap in that asset, and the contract has an immutable ceiling `MAX_FEE_BPS = 1000` (1%). All tiers are **0 bps today**. See [Fee Model](./fee-model.md).

---

## Write Functions — Transfers

### `send`

Send an ERC-20 transfer. Two overloads:

```solidity
function send(address token, address to, uint256 amount, bytes32 txCode, uint256 settlementDate) external;

// With a fee cap in the transfer asset:
function send(address token, address to, uint256 amount, bytes32 txCode, uint256 settlementDate, uint256 maxFee) external;
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | `address` | ERC-20 on the supported-token allowlist |
| `to` | `address` | Recipient (fixed forever; cannot be the protocol itself) |
| `amount` | `uint256` | Amount pulled from the sender (token's smallest unit). The recipient receives `amount − fee`. |
| `txCode` | `bytes32` | Unique code for this sender→recipient pair (deduplication) |
| `settlementDate` | `uint256` | Unix timestamp. `0` or any past/current time ⇒ instant. A future time ⇒ held until then. |
| `maxFee` | `uint256` | *(6-arg overload)* Strict cap on the in-kind fee, in `token` units. Reverts `FeeExceedsMax(fee, maxFee)` if the computed fee exceeds it. **`0` means "accept no fee"** (it is *not* "no cap"). The 5-arg overload applies no cap. |

**Requirements:** `supportedTokens(token)`; a registered, fresh price feed for `token` unless it is fee-exempt; caller approved ≥ `amount`; `txCode` unused for `(sender, to)`; `to != 0` and `to != address(this)`; `amount > 0`; not paused.

**Events:** `InstantTransfer` (instant) **or** `TransferCreated` (scheduled).

**Reverts:** `TokenNotSupported`, `DuplicateTransactionCode`, `ZeroAddress`, `InvalidRecipient`, `ZeroAmount`, `FeeExceedsMax`, `PriceFeedNotSet`, `StalePrice`, `InvalidPrice`, `EnforcedPause`.

> The contract credits the **actual balance received** (balance delta), so accounting stays solvent — but fee-on-transfer / rebasing tokens are kept off the allowlist by policy.

### `sendWithPermit`

One-signature send for ERC-2612 tokens (e.g. USDC): the permit and the send happen in one transaction, no separate `approve`.

```solidity
function sendWithPermit(address token, address to, uint256 amount, bytes32 txCode, uint256 settlementDate,
                        uint256 maxFee, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;
```

The `permit` call is wrapped in `try/catch`, so a front-run of the permit cannot break the send (the `transferFrom` still succeeds from the resulting allowance). Same requirements, events and reverts as `send`.

### `sendNative`

Send native ETH; the amount is `msg.value`.

```solidity
function sendNative(address to, bytes32 txCode, uint256 settlementDate) external payable;
function sendNative(address to, bytes32 txCode, uint256 settlementDate, uint256 maxFee) external payable;
```

Native ETH is not on the allowlist but must have an ETH/USD feed registered. **Instant** native sends push ETH directly and revert `NativeTransferFailed` if the recipient cannot receive ETH; **scheduled** native sends go through deliver-or-credit at release (see below), so a non-payable recipient receives WETH instead.

---

## Write Functions — Resolving a scheduled transfer

### `release`

Push a settled transfer to its fixed recipient. **Permissionless** — anyone may call on/after the settlement date; the funds always go to the recipient chosen at send time, so a third party can only complete the intended payment.

```solidity
function release(address sender, address recipient, bytes32 txCode) external;
```

**Requirements:** record exists; `block.timestamp >= settlementDate`; not already released or rejected. **Not pausable.**

**Effects:** marks `released`, accrues the fee, delivers `amount` via deliver-or-credit.

**Events:** `TransferReleased(transferKey, recipient, caller, token, amount, timestamp)`, plus `PayoutWrapped` or `PayoutDeferred` if the push could not be delivered directly.

**Reverts:** `TransferNotFound`, `SettlementDateNotReached`, `AlreadyReleased`, `AlreadyRejected`.

### `releaseMany`

Release many due transfers in one transaction (keeper / platform batch).

```solidity
function releaseMany(address[] calldata senders, address[] calldata recipients, bytes32[] calldata txCodes) external;
```

Entries that don't exist, aren't due, or are already resolved are **skipped**, and an undeliverable payout is **credited** rather than reverting — one bad entry never fails the batch. Reverts only on `ArrayLengthMismatch`.

### `reject`

The recipient declines a pending scheduled transfer; the **full escrow (net + fee)** is refunded to the original sender. Allowed **any time before release** — before or after the settlement date (after the date it races `release`; whichever lands first wins). Only the recipient may call; the sender can never cancel, reverse or redirect.

```solidity
function reject(address sender, bytes32 txCode) external;
```

The caller is implicitly the recipient (key = `keccak256(sender, msg.sender, txCode)`). Also reverses the transfer's contribution to the sender's monthly fee volume if still within the same period. **Not pausable.**

**Events:** `TransferRejected`. **Reverts:** `TransferNotFound`, `NotRecipient`, `AlreadyReleased`, `AlreadyRejected`.

### `shortenSettlementDate`

The **sender** may bring a scheduled transfer's date **earlier** (never later). This only accelerates payment to the same recipient, so sender-finality is unchanged. `newDate = 0` or a past time makes it immediately releasable; the recipient's reject option stays open until release.

```solidity
function shortenSettlementDate(address recipient, bytes32 txCode, uint256 newDate) external;
```

**Events:** `SettlementDateShortened`. **Reverts:** `TransferNotFound`, `AlreadyReleased`, `AlreadyRejected`, `CannotExtendSettlement`.

---

## Deliver-or-credit and `withdraw`

Every outbound payout that resolves an escrow (`release`, `releaseMany`, `reject`, `reclaim`, `reclaimCampaign`) is attempted as a push and **never reverts the caller if the push fails**:

- **Native ETH** that cannot be pushed (recipient contract without a payable `receive`) is **wrapped to WETH** (`0xC02aaA39…6Cc2`) and delivered as an ERC-20 — `PayoutWrapped(beneficiary, amount)`. No action needed by the recipient.
- An **ERC-20** the token refuses to deliver (e.g. a token that froze the address) is credited to `withdrawable[beneficiary][token]` — `PayoutDeferred(beneficiary, token, amount)`.

### `withdraw`

Pull a credited amount to an address of your choosing (need not be the original destination).

```solidity
function withdraw(address token, address to) external;
function withdrawable(address beneficiary, address token) external view returns (uint256);
```

Only the beneficiary can pull their credit. **Not pausable.** **Events:** `Withdrawn(beneficiary, token, to, amount)`. **Reverts:** `ZeroAddress`, `NothingToWithdraw`, `NativeTransferFailed`.

> Integration note: a **contract** beneficiary must be able to hold WETH or call `withdraw`. This is the sender's / integrator's responsibility when choosing a destination.

---

## Write Functions — Claim-by-link (no recipient address)

Lock a payment to a **one-time claim key** instead of an address. The key's private key is the shareable "link"; whoever holds it claims to any payout address of their choice, before `expiry`. If never claimed, the sender reclaims after `expiry`.

```solidity
function createClaimable(address token, uint256 amount, bytes32 txCode, address claimAddr, uint256 expiry, uint256 maxFee) external;
function createClaimableNative(bytes32 txCode, address claimAddr, uint256 expiry, uint256 maxFee) external payable;
function claimTo(address sender, address claimAddr, bytes32 txCode, address payoutTo, bytes calldata signature) external;
function reclaim(address claimAddr, bytes32 txCode) external;
```

- `expiry` must be in the future. The fee (if any) is taken at creation from the escrow; `maxFee` caps it.
- **`claimTo` is front-run-safe:** `signature` is an EIP-712 signature by the claim key over `Claim(address sender, address claimAddr, bytes32 txCode, address payoutTo)` — domain `{ name: "VektesProtocolV2", version: "2", chainId, verifyingContract }`. Because `payoutTo` is inside the signed struct, a watcher who copies the signature from the mempool cannot redirect the funds. Anyone may submit it (the claimant's wallet pays gas). Reverts `ClaimWindowClosed` once `block.timestamp >= expiry`, so claiming and reclaiming are mutually exclusive.
- `reclaim` is sender-only (by key construction), works on/after `expiry`, refunds net + fee via deliver-or-credit.
- `claimTo` and `reclaim` are **not pausable**.

**Events:** `ClaimableCreated`, `ClaimableClaimed`, `ClaimableReclaimed`. **Reverts:** `ClaimableNotFound`, `AlreadyClaimed`, `AlreadyReclaimed`, `ClaimWindowClosed`, `ExpiryNotReached`, `InvalidSignature`, `InvalidExpiry`, `InvalidRecipient`, plus the send-path reverts.

---

## Write Functions — Airdrop campaigns (one link, many claims)

Fund a pool under one shared **campaign key**; each payout address may claim a fixed `amountPerClaim` **once**, before `expiry`. ERC-20 only.

```solidity
function createCampaign(address token, uint256 amountPerClaim, uint256 poolAmount, address campaignKey, bytes32 txCode, uint256 expiry, uint256 maxFee) external;
function topUpCampaign(address campaignKey, bytes32 txCode, uint256 addAmount, uint256 maxFee) external;
function claimCampaign(address sender, address campaignKey, bytes32 txCode, address payoutTo, bytes calldata signature) external;
function reclaimCampaign(address campaignKey, bytes32 txCode) external;
```

- The fee (if any) is charged on the funded pool at creation and on each top-up; the net pool must cover at least one claim.
- `claimCampaign` uses the same EIP-712 `Claim` struct as `claimTo` (signed by the campaign key with the claimant's `payoutTo`). One claim per `payoutTo` per campaign — this is a per-address guard, **not** sybil-proof.
- `reclaimCampaign` returns the unclaimed remainder to the sender on/after `expiry` (deliver-or-credit) and closes the campaign.

**Events:** `CampaignCreated`, `CampaignToppedUp`, `CampaignClaimed`, `CampaignReclaimed`. **Reverts:** `CampaignNotFound`, `CampaignClosed`, `CampaignEmpty`, `AlreadyClaimedCampaign`, `InvalidCampaignParams`, `ClaimWindowClosed`, `ExpiryNotReached`, `InvalidSignature`.

---

## Write Functions — Recurring allowance (standing order / direct debit)

A sender authorises a **named recipient** to pull a fixed amount each period from the sender's wallet. **No funds are escrowed** — each claim pulls from the sender's balance via their standing ERC-20 approval to the contract, so collection is best-effort, like a card charge. ERC-20 only.

```solidity
function createAllowance(address token, address recipient, uint256 amountPerPeriod, uint256 periodLength,
                         uint256 startTime, uint256 endTime, uint256 maxArrears, bytes32 txCode) external;
function claimAllowance(address sender, address recipient, bytes32 txCode, uint256 maxFee) external;   // recipient-only
function cancelAllowance(address recipient, bytes32 txCode) external;                                  // sender-only
function extendAllowance(address recipient, bytes32 txCode, uint256 newEndTime) external;              // sender-only
```

| Parameter | Meaning |
|-----------|---------|
| `startTime` | When the first period unlocks. `0` = now (first pull immediate); a future time = a delayed first charge (free trial); each next period unlocks `periodLength` later. |
| `endTime` | **Required** hard end date (must be after start). No period accrues past it. The sender can push it out later with `extendAllowance` (renewal). |
| `maxArrears` | Max unclaimed periods claimable at once (≥ 1). Older unclaimed periods **lapse**, so a long-dormant order can never be drained in bulk. |

`claimAllowance` pays as many **whole** due periods as the sender can currently cover (balance ∩ approval); any shortfall is simply not collected and can be retried next cycle. `maxFee` caps the in-kind fee on the pulled amount. `cancelAllowance` ends the order immediately and **forfeits all unclaimed periods** (the payment is treated as an advance). `extendAllowance` is extend-only.

**Events:** `AllowanceCreated`, `AllowanceClaimed`, `AllowanceCancelled`, `AllowanceExtended`. **Reverts:** `AllowanceNotFound`, `NotRecipient`, `NothingDue`, `FunderUnfunded`, `AllowanceEnded`, `InvalidPeriod`, `InvalidMaxArrears`, `InvalidExpiry`.

---

## View Functions

### `getTransfer`

```solidity
function getTransfer(address sender, address recipient, bytes32 txCode) external view returns (Transfer memory);

struct Transfer {
    address token;          // ERC-20 (address(0) = native ETH)
    address sender;
    address recipient;      // fixed at send time
    uint256 amount;         // NET owed to the recipient (fee already deducted)
    uint256 fee;            // in-kind fee held with the escrow (refunded on reject, accrued on release)
    uint256 settlementDate; // on/after this, anyone may release()
    uint256 createdAt;
    bytes32 txCode;
    bool released;
    bool rejected;
    uint256 usdVolume;      // USD-6 volume this transfer added to the sender's monthly tally
    uint256 volumePeriod;   // the 30-day period it was counted in
}
```

For instant transfers (or unknown keys) all fields are zero — instant transfers are not stored; track them via `InstantTransfer`.

### `isReleasable`

```solidity
function isReleasable(address sender, address recipient, bytes32 txCode) external view returns (bool);
```

`true` when the scheduled transfer exists, is unresolved, and `block.timestamp >= settlementDate`.

### `isCodeUsed`

```solidity
function isCodeUsed(address sender, address recipient, bytes32 txCode) external view returns (bool);
```

Whether a code has been used for a `(sender, counterparty)` pair (any flow).

### `previewFee`

```solidity
function previewFee(address sender, address token, uint256 amount) external view returns (uint256 fee);
```

The in-kind fee, **in `token` units**, that `sender` would pay to move `amount` right now (their monthly tier, including this transfer). It equals the fee actually charged, so it is safe to pass as `maxFee`. Returns `0` for fee-exempt tokens and while all tiers are 0.

### `getCurrentTier`

```solidity
function getCurrentTier(address sender) external view returns (uint256 tierIndex, uint256 feeBps);
```

`feeBps` is in units of 0.001% (`5` = 0.005%), based on the sender's rolling 30-day USD volume.

### Claim-by-link, campaign and allowance views

```solidity
function getClaimable(address sender, address claimAddr, bytes32 txCode) external view returns (Claimable memory);
function getCampaign(address sender, address campaignKey, bytes32 txCode) external view returns (Campaign memory);
function hasClaimedCampaign(address sender, address campaignKey, bytes32 txCode, address who) external view returns (bool);
function getAllowance(address sender, address recipient, bytes32 txCode) external view returns (Allowance memory);
function previewAllowanceClaim(address sender, address recipient, bytes32 txCode) external view returns (uint256 periodsDue, uint256 grossAmount);
```

`previewAllowanceClaim` returns the *entitlement* only — it does not check whether the sender currently holds the balance/approval to cover it.

### Public getters

| Getter | Returns |
|--------|---------|
| `transfers(bytes32)` / `claimables(bytes32)` / `campaigns(bytes32)` / `allowances(bytes32)` | Raw records by key |
| `campaignClaimed(bytes32 key, address who)` | Per-address campaign claim flag |
| `usedCodes(bytes32)` | Whether a code-key is used |
| `withdrawable(address beneficiary, address token)` | Credited, pull-able balance |
| `monthlyVolume(address)` / `volumeResetMonth(address)` | Sender's USD-6 volume and its 30-day epoch |
| `feeTiers(uint256 i)` | `(threshold, feeBps)` for tier `i` (4 tiers) |
| `MAX_FEE_BPS()` | `1000` — immutable 1% fee ceiling |
| `accruedFees(address token)` | In-kind fees earned and not yet swept to the treasury |
| `treasury()` / `WETH()` | Fee destination; canonical WETH used by the native fallback |
| `supportedTokens(address)` / `feeExempt(address)` | Allowlist membership; fee-exempt flag (e.g. $VEK) |
| `priceFeeds(address)` / `stalePriceThreshold(address)` | Chainlink feed + max age per token |
| `totalTransfers()` | Lifetime counter across all record types |
| `owner()` / `pendingOwner()` / `paused()` | Ownable2Step + Pausable state |

---

## Events

```solidity
event InstantTransfer(address indexed sender, address indexed recipient, address token, uint256 amount, uint256 fee, bytes32 txCode, uint256 timestamp);
event TransferCreated(bytes32 indexed transferKey, address indexed sender, address indexed recipient, address token, uint256 amount, uint256 fee, bytes32 txCode, uint256 settlementDate, uint256 createdAt);
event TransferReleased(bytes32 indexed transferKey, address indexed recipient, address indexed caller, address token, uint256 amount, uint256 timestamp);
event TransferRejected(bytes32 indexed transferKey, address indexed recipient, address indexed sender, address token, uint256 amount, uint256 rejectedAt);
event SettlementDateShortened(bytes32 indexed transferKey, address indexed sender, uint256 oldSettlementDate, uint256 newSettlementDate);
event PayoutWrapped(address indexed beneficiary, uint256 amount);                                   // ETH delivered as WETH
event PayoutDeferred(address indexed beneficiary, address indexed token, uint256 amount);           // credited for withdraw()
event Withdrawn(address indexed beneficiary, address indexed token, address to, uint256 amount);

event ClaimableCreated(bytes32 indexed key, address indexed sender, address indexed claimAddr, address token, uint256 amount, uint256 fee, bytes32 txCode, uint256 expiry, uint256 createdAt);
event ClaimableClaimed(bytes32 indexed key, address indexed claimAddr, address indexed payoutTo, address caller, address token, uint256 amount, uint256 timestamp);
event ClaimableReclaimed(bytes32 indexed key, address indexed sender, address token, uint256 amount, uint256 timestamp);

event CampaignCreated(bytes32 indexed key, address indexed sender, address indexed campaignKey, address token, uint256 amountPerClaim, uint256 pool, bytes32 txCode, uint256 expiry);
event CampaignToppedUp(bytes32 indexed key, address indexed sender, uint256 added, uint256 remaining);
event CampaignClaimed(bytes32 indexed key, address indexed campaignKey, address indexed payoutTo, address token, uint256 amount, uint256 remaining);
event CampaignReclaimed(bytes32 indexed key, address indexed sender, address token, uint256 amount);

event AllowanceCreated(bytes32 indexed key, address indexed sender, address indexed recipient, address token, uint256 amountPerPeriod, uint256 periodLength, uint256 startTime, uint256 endTime, uint256 maxArrears, bytes32 txCode);
event AllowanceClaimed(bytes32 indexed key, address indexed recipient, address token, uint256 periodsPaid, uint256 amountNet, uint256 fee, uint256 claimedPeriods, uint256 timestamp);
event AllowanceCancelled(bytes32 indexed key, address indexed sender, address indexed recipient, uint256 endTime);
event AllowanceExtended(bytes32 indexed key, address indexed sender, address indexed recipient, uint256 oldEndTime, uint256 newEndTime);
```

`amount` in `InstantTransfer` / `TransferCreated` / `TransferReleased` is the **net** delivered to the recipient. Admin events: `FeesWithdrawn`, `FeeExemptUpdated`, `FeeTierUpdated`, `TreasuryUpdated`, `TokenSupportUpdated`, `PriceFeedUpdated`, `StalePriceThresholdUpdated`, plus `OwnershipTransferStarted` / `OwnershipTransferred` and `Paused` / `Unpaused`.

---

## Error Reference

| Error | Cause |
|-------|-------|
| `DuplicateTransactionCode(bytes32 txCode, address counterparty)` | Code already used for this sender→counterparty pair |
| `ZeroAddress()` / `ZeroAmount()` | Zero destination / zero amount or `msg.value` |
| `InvalidRecipient()` | The protocol contract itself was given as recipient or payout address |
| `TokenNotSupported(address token)` | Token not on the allowlist |
| `TransferNotFound(bytes32 key)` | No scheduled transfer for this key |
| `NotRecipient(address caller, address expected)` | Caller is not the recipient (reject / claimAllowance) |
| `SettlementDateNotReached(uint256 date, uint256 now)` | Release attempted before the date |
| `AlreadyReleased(bytes32 key)` / `AlreadyRejected(bytes32 key)` | Transfer already resolved |
| `CannotExtendSettlement(uint256 current, uint256 requested)` | `shortenSettlementDate` with a later-or-equal date |
| `FeeExceedsMax(uint256 fee, uint256 maxFee)` | Computed in-kind fee exceeds the caller's cap |
| `FeeExceedsCap(uint256 feeBps, uint256 maxBps)` | Owner tried to set a tier above `MAX_FEE_BPS` |
| `PriceFeedNotSet` / `InvalidPrice` / `StalePrice(address token)` | Oracle unset, non-positive, or older than the token's threshold |
| `NothingToWithdraw()` | No credited balance for the caller in that token |
| `NativeTransferFailed()` | A direct ETH push failed (instant native send, `claimTo` to a non-payable address, or `withdraw` to one) |
| `ClaimableNotFound` / `AlreadyClaimed` / `AlreadyReclaimed(bytes32 key)` | Claim-by-link state errors |
| `ClaimWindowClosed(uint256 expiry, uint256 now)` | Claim attempted at/after expiry (claim-by-link or campaign) |
| `ExpiryNotReached(uint256 expiry, uint256 now)` | Reclaim attempted before expiry |
| `InvalidSignature()` / `InvalidExpiry()` | Bad EIP-712 signature; expiry not in the future / end not after start |
| `CampaignNotFound` / `CampaignClosed` / `CampaignEmpty(bytes32 key)` / `AlreadyClaimedCampaign(bytes32 key, address payoutTo)` / `InvalidCampaignParams()` | Campaign state errors |
| `AllowanceNotFound(bytes32 key)` / `NothingDue` / `FunderUnfunded` / `AllowanceEnded(bytes32 key)` / `InvalidPeriod()` / `InvalidMaxArrears()` | Recurring-allowance state errors |
| `ExceedsAccruedFees(address token, uint256 requested, uint256 available)` | Owner sweep above accrued fees |
| `ArrayLengthMismatch()` / `InvalidTierIndex()` / `ZeroThreshold()` / `NoPriceFeed()` / `Unauthorized()` | Batch / admin argument errors; `_payout` called by anyone but the contract |
| `EnforcedPause()` | Creation path attempted while paused |

Standard OpenZeppelin errors also apply: `OwnableUnauthorizedAccount`, `OwnableInvalidOwner`, `ReentrancyGuardReentrantCall`, `SafeERC20FailedOperation`.

---

## Admin Functions (owner-only)

The owner is the 2-of-3 Gnosis Safe (`Ownable2Step`). See [Security](./security.md) for the owner's exact powers and limits.

`withdrawFees(address token, uint256 amount)` — sweeps **accrued in-kind fees only** to `treasury()`; can never touch escrowed user funds · `setFeeExempt(address, bool)` · `updateFeeTier(uint256 index, uint256 threshold, uint256 feeBps)` (bounded by `MAX_FEE_BPS`) · `setTreasury(address)` · `setTokenSupport(address, bool)` · `setPriceFeed(address token, address feed, uint256 threshold)` · `setStalePriceThreshold(address, uint256)` · `pause()` / `unpause()` · `transferOwnership(address)` / `acceptOwnership()`.

**Pause scope:** only *creation* paths pause — `send`, `sendWithPermit`, `sendNative`, `createClaimable`, `createClaimableNative`, `createCampaign`, `topUpCampaign`, `createAllowance`. `release`, `releaseMany`, `reject`, `shortenSettlementDate`, `withdraw`, `claimTo`, `reclaim`, `claimCampaign`, `reclaimCampaign`, `claimAllowance`, `cancelAllowance` and `extendAllowance` **never pause** — funds already committed can always exit.
