# Protocol Reference

Complete function reference for the deployed Vektes smart contract (`VektesProtocol`, immutable).

**Contract:** `0xd0554A67EB0438a28A31adFc8D4CfBb4ec50E8B7`

> **Key model:** a transfer is identified by the tuple **`(sender, recipient, txCode)`**. The on-chain key is `keccak256(abi.encodePacked(sender, recipient, txCode))`. A `txCode` is therefore unique **per sender→recipient pair**, and all lookups require the recipient as well as the sender.
>
> **Instant vs. scheduled:** if `settlementDate <= block.timestamp` (e.g. `0`), the transfer is **instant** — funds are delivered to the recipient inside the same transaction and **no record is stored** (only an `InstantTransfer` event is emitted). If `settlementDate` is in the future, the transfer is **scheduled** — funds are held until the recipient calls `claim()` (or the recipient `rejectTransfer()`s to refund the sender).

---

## Write Functions

### `send`

Send an ERC-20 token transfer. Two overloads:

```solidity
function send(
    address token,
    address to,
    uint256 amount,
    bytes32 txCode,
    uint256 settlementDate
) external;

// With a $VEK fee slippage cap:
function send(
    address token,
    address to,
    uint256 amount,
    bytes32 txCode,
    uint256 settlementDate,
    uint256 maxFeeVek
) external;
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | `address` | ERC-20 token contract address (must be on the supported-token allowlist) |
| `to` | `address` | Recipient address |
| `amount` | `uint256` | Transfer amount (token's smallest unit). The recipient receives the **full amount** — the fee is charged separately in $VEK. |
| `txCode` | `bytes32` | Unique code for this sender→recipient pair (deduplication) |
| `settlementDate` | `uint256` | Unix timestamp. `0` or any past/current time ⇒ instant delivery. A future time ⇒ held until then. |
| `maxFeeVek` | `uint256` | *(6-arg overload)* Max $VEK fee the sender will pay. Reverts `FeeExceedsMax` if the computed fee exceeds it. `0` disables the cap. |

**Requirements:**
- `token` is on the allowlist (`supportedTokens(token) == true`) and has a registered price feed
- Caller has approved the protocol for ≥ `amount` of `token` (and, if a fee applies, ≥ `feeVek` of VEK)
- `txCode` not previously used for this `(sender, to)` pair
- `to != address(0)`, `amount > 0`
- Not paused

**Events:** `InstantTransfer` (instant) **or** `TransferCreated` (scheduled).

**Reverts:** `TokenNotSupported`, `DuplicateTransactionCode`, `ZeroAddress`, `ZeroAmount`, `FeeExceedsMax`, `PriceFeedNotSet`, `StalePrice`, `InvalidPrice`, `FeeTokenNotSet`, `EnforcedPause`.

> The contract credits the **actual balance received** (post-transfer), so transfers stay solvent — but fee-on-transfer / rebasing tokens are not on the allowlist by policy.

---

### `sendNative`

Send native ETH. Two overloads (with and without the `maxFeeVek` cap). The amount is `msg.value`.

```solidity
function sendNative(address to, bytes32 txCode, uint256 settlementDate) external payable;
function sendNative(address to, bytes32 txCode, uint256 settlementDate, uint256 maxFeeVek) external payable;
```

**Requirements:** `msg.value > 0`, `to != address(0)`, unused `txCode` for the pair, not paused. Native ETH does **not** need to be on the allowlist, but the ETH/USD price feed must be registered.

**Events:** `InstantTransfer` or `TransferCreated` with `token = address(0)`.

---

### `claim`

Recipient pulls funds from a **scheduled** transfer after its settlement date.

```solidity
function claim(address sender, bytes32 txCode) external;
```

The caller is implicitly the recipient (the key is `keccak256(sender, msg.sender, txCode)`).

**Requirements:**
- The transfer exists (was scheduled — instant transfers are already delivered and have no record)
- Caller is the recipient
- `block.timestamp >= settlementDate`
- Not already claimed or rejected

**Events:** `TransferClaimed`.

**Reverts:** `TransferNotFound`, `NotRecipient`, `SettlementDateNotReached`, `AlreadyClaimed`, `AlreadyCancelled`.

> `claim` is **not** pausable — a pause never traps funds already locked in the contract.

---

### `rejectTransfer`

Recipient declines a scheduled transfer; the locked funds are refunded to the **original sender** (never to the recipient).

```solidity
function rejectTransfer(address sender, bytes32 txCode) external;
```

**Requirements:** caller is the recipient; not already claimed or rejected. Can be called **any time before claiming** — before or after the settlement date.

**Events:** `TransferRejected`.

**Reverts:** `TransferNotFound`, `NotRecipient`, `AlreadyClaimed`, `AlreadyCancelled`.

---

### `batchClaim`

Claim multiple scheduled transfers in one transaction.

```solidity
function batchClaim(address[] calldata senders, bytes32[] calldata txCodes) external;
```

- `senders.length` must equal `txCodes.length` (else reverts `"Array length mismatch"`).
- **Non-claimable entries are skipped, not reverted.** Any `(senders[i], txCodes[i])` that doesn't exist, isn't the caller's, hasn't settled, or is already claimed/rejected is silently skipped — the rest still process. (Contrast with `claim`, which reverts.)

**Events:** one `TransferClaimed` per successfully claimed transfer.

---

## View Functions

### `getTransfer`

```solidity
function getTransfer(address sender, address recipient, bytes32 txCode)
    external view returns (Transfer memory);
```

Returns the stored `Transfer` for a **scheduled** transfer. For instant transfers (or unknown keys) all fields are zero — instant transfers are not stored; track them via the `InstantTransfer` event.

```solidity
struct Transfer {
    address token;          // ERC-20 address (address(0) = native ETH)
    address sender;         // original sender
    address recipient;      // designated recipient
    uint256 amount;         // amount owed to the recipient (delivered in full)
    uint256 fee;            // protocol fee charged, denominated in $VEK
    uint256 settlementDate; // unix timestamp claim becomes available
    uint256 createdAt;      // block timestamp of creation
    bytes32 txCode;         // user-provided code
    bool claimed;           // recipient has claimed
    bool cancelled;         // recipient rejected (funds refunded to sender)
}
```

### `isClaimable`

```solidity
function isClaimable(address sender, address recipient, bytes32 txCode) external view returns (bool);
```

`true` when the (scheduled) transfer exists, is not claimed, not cancelled, and `block.timestamp >= settlementDate`.

### `isCodeUsed`

```solidity
function isCodeUsed(address sender, address recipient, bytes32 txCode) external view returns (bool);
```

Whether a code has already been used for a `(sender, recipient)` pair. Useful to pre-validate before sending.

### `previewFee`

```solidity
function previewFee(address sender, address token, uint256 amount) external view returns (uint256 feeInVek);
```

The protocol fee (in $VEK base units) that `sender` would pay to transfer `amount` of `token`. It accounts for the sender's current monthly volume tier and equals the fee actually charged — so it's safe to pass as `maxFeeVek`. Returns `0` on the free tier (which is every tier today). See [Fee Model](./fee-model.md).

### `getCurrentTier`

```solidity
function getCurrentTier(address sender) external view returns (uint256 tierIndex, uint256 feeBps);
```

The fee tier that currently applies to `sender`, based on their **monthly (rolling 30-day) volume**. `feeBps` is in units of 0.001% (e.g. `5` = 0.005%). Note the tier depends on the *sender's accumulated volume*, not the size of any single transfer.

### Public getters

| Getter | Returns |
|--------|---------|
| `transfers(bytes32 key)` | The raw `Transfer` tuple by its key |
| `usedCodes(bytes32 key)` | Whether a code-key is used |
| `monthlyVolume(address)` / `volumeResetMonth(address)` | Sender's tracked USD-6 volume and its 30-day epoch |
| `feeTiers(uint256 i)` | `(threshold, feeBps)` for tier `i` |
| `treasury()` / `feeToken()` / `burnPercentage()` | Fee routing config |
| `BURN_ADDRESS()` | `0x…dEaD` |
| `supportedTokens(address)` | Allowlist membership |
| `priceFeeds(address)` / `stalePriceThreshold(address)` | Chainlink feed + max age per token |
| `totalTransfers()` / `totalFeesCollected()` | Lifetime counters |
| `owner()` / `pendingOwner()` / `paused()` | Ownable2Step + Pausable state |

---

## Events

```solidity
event TransferCreated(bytes32 indexed transferKey, address indexed sender, address indexed recipient,
                      address token, uint256 amount, uint256 fee, bytes32 txCode, uint256 settlementDate, uint256 createdAt);
event InstantTransfer(address indexed sender, address indexed recipient,
                      address token, uint256 amount, uint256 fee, bytes32 txCode, uint256 timestamp);
event TransferClaimed(bytes32 indexed transferKey, address indexed recipient, address token, uint256 amount, uint256 claimedAt);
event TransferRejected(bytes32 indexed transferKey, address indexed recipient, address indexed sender, address token, uint256 amount, uint256 rejectedAt);
```

| Event | Emitted When |
|-------|-------------|
| `InstantTransfer` | An instant transfer (`settlementDate <= now`) is delivered |
| `TransferCreated` | A scheduled transfer (future `settlementDate`) is locked |
| `TransferClaimed` | A recipient claims a scheduled transfer |
| `TransferRejected` | A recipient rejects and the sender is refunded |

Admin events: `FeeTierUpdated`, `TreasuryUpdated`, `BurnPercentageUpdated`, `TokenSupportUpdated`, `PriceFeedUpdated`, `StalePriceThresholdUpdated`, `FeeTokenUpdated`, plus `OwnershipTransferStarted` / `OwnershipTransferred` (Ownable2Step) and `Paused` / `Unpaused`.

---

## Error Reference

| Error | Cause |
|-------|-------|
| `DuplicateTransactionCode(bytes32 txCode, address recipient)` | Code already used for this sender→recipient pair |
| `ZeroAddress()` | Recipient is the zero address |
| `ZeroAmount()` | Amount / `msg.value` is 0 |
| `TokenNotSupported(address token)` | Token is not on the allowlist |
| `NotRecipient(address caller, address expectedRecipient)` | Caller is not the transfer's recipient |
| `TransferNotFound(bytes32 transferKey)` | No scheduled transfer for this key |
| `SettlementDateNotReached(uint256 settlementDate, uint256 currentTime)` | Claimed before settlement |
| `AlreadyClaimed(bytes32 transferKey)` | Transfer already claimed |
| `AlreadyCancelled(bytes32 transferKey)` | Transfer already rejected |
| `FeeExceedsMax(uint256 feeVek, uint256 maxFeeVek)` | Computed $VEK fee exceeded the sender's cap |
| `PriceFeedNotSet(address token)` | No Chainlink feed registered for the token / fee token |
| `InvalidPrice(address token)` | Oracle returned a non-positive price |
| `StalePrice(address token)` | Oracle answer older than the token's staleness threshold |
| `FeeTokenNotSet()` | Fee token unconfigured (only reachable if a fee is due) |
| `InsufficientNativeValue(uint256 sent, uint256 required)` | Native value below what's required |
| `EnforcedPause()` | New sends attempted while paused |

Standard OpenZeppelin errors also apply: `OwnableUnauthorizedAccount`, `OwnableInvalidOwner`, `ReentrancyGuardReentrantCall`, `SafeERC20FailedOperation`.

---

## Admin Functions (owner-only)

The owner is the Gnosis Safe (Ownable2Step). See [Security](./security.md) for what the owner can and cannot do.

`pause()` · `unpause()` · `setTreasury(address)` · `setBurnPercentage(uint256)` · `setTokenSupport(address, bool)` · `setPriceFeed(address token, address feed, uint256 threshold)` · `setStalePriceThreshold(address, uint256)` · `setFeeToken(address)` · `updateFeeTier(uint256 index, uint256 threshold, uint256 feeBps)` · `transferOwnership(address)` / `acceptOwnership()`
