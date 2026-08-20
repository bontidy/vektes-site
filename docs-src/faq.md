# FAQ

Common questions about the Vektes protocol.

---

## General

### What is Vektes?

Vektes is an on-chain settlement protocol that adds wire-transfer-style guarantees to EVM token transfers — deduplication, optional settlement scheduling, sender-irrevocability, and recipient rejection.

### What problem does it solve?

Plain ERC-20 `transfer()` is fire-and-forget. Vektes adds:
- **Deduplication** — a code, unique per **sender→recipient** pair, makes double-sends impossible.
- **Settlement windows** — optionally hold funds until a chosen date.
- **Irrevocability** — senders can't claw back (same guarantee as a bank wire).
- **Recipient controls** — recipients can reject a pending (scheduled) transfer.

### Is Vektes custodial?

No. It's a non-custodial, immutable smart contract. For instant transfers funds pass straight through to the recipient; for scheduled transfers they're held by the contract until the recipient claims. No party — including the owner — can redirect or seize funds.

---

## Transfers

### Instant or scheduled — what's the difference?

If `settlementDate <= now` (e.g. `0`), the transfer is **instant**: the recipient gets the funds in the same transaction, and nothing is stored to claim. If `settlementDate` is in the future, it's **scheduled**: funds are held until then and the recipient calls `claim()`.

### Can I cancel a transfer after sending?

No. Transfers are **irrevocable by the sender**. The only way funds return is if the recipient rejects a *scheduled* transfer via `rejectTransfer()` (which refunds the sender). Instant transfers are final on delivery.

### What happens if the recipient never claims a scheduled transfer?

Funds stay locked in the contract indefinitely; the sender cannot reclaim them. (The recipient can still `rejectTransfer` to refund the sender.)

### What tokens are supported?

A **curated allowlist** of standard ERC-20s (currently USDC and USDT), plus native ETH via `sendNative()`. Sending a non-allowlisted token reverts with `TokenNotSupported`. Fee-on-transfer and rebasing tokens are intentionally excluded. Check `supportedTokens(token)` first.

### What happens if I reuse a transaction code?

It reverts with `DuplicateTransactionCode(txCode, recipient)`. A code is unique per **`(sender, recipient)`** pair — the same code *can* be reused with a different recipient. Check with `isCodeUsed(sender, recipient, txCode)`.

---

## Settlement

### What does `settlementDate = 0` mean?

Instant delivery — the recipient receives funds immediately in the send transaction. (Any past/current timestamp is treated the same way.)

### Can the settlement date be changed after sending?

No. It's fixed when the transfer is created.

### Can the recipient reject before the settlement date?

Yes. `rejectTransfer()` works any time before the transfer is claimed — before or after the settlement date.

---

## Fees

### How much does it cost?

**Currently nothing** — the protocol launched with all fee tiers set to `0`. When fees are activated, they're tiered by the **sender's monthly volume** (0.005% / 0.01% / 0.02% above a free tier), paid in $VEK, and the recipient always receives the full transfer amount. See the [Fee Model](./fee-model.md).

### What token are fees paid in?

**$VEK**. When fees are active you must hold VEK and approve the protocol to spend it. While fees are `0`, no VEK is needed.

### Is there a maximum fee?

There's no fixed cap. Instead you set a **per-transaction cap** (`maxFeeVek`) via the 6-argument `send`/`sendNative` overloads; the send reverts with `FeeExceedsMax` if the fee would exceed it. Quote the fee with `previewFee(sender, token, amount)`.

### Are fee tiers based on the transfer size?

No — on the **sender's cumulative volume over a rolling ~30-day window**. Two transfers of the same size can land in different tiers depending on the sender's monthly total.

### Where do fees go?

Split by `burnPercentage` (currently 50): half burned to `0x…dEaD`, half to the treasury (the Gnosis Safe). The split is owner-adjustable.

---

## Claiming

### Who can claim?

Only the designated recipient of a scheduled transfer. No one else — not even the owner. (Instant transfers need no claim.)

### Can I claim multiple transfers at once?

Yes — `batchClaim(senders[], txCodes[])`. Non-claimable entries in the batch are **skipped**, not reverted, so one bad entry doesn't fail the whole call.

### How do I reject a transfer?

`rejectTransfer(sender, txCode)` — funds return to the original sender. Any time before claiming.

### Can I partially claim?

No. Claims are all-or-nothing; the full amount goes to the recipient.

---

## Security

### Has it been audited?

Yes — by **CertiK**, no critical/high findings. See [Security](./security.md).

### Is the contract upgradeable?

No. Immutable — no proxy, no `delegatecall`.

### What can the owner do?

The owner (a 2-of-3 Gnosis Safe, `Ownable2Step`) can only **configure**: pause/unpause new sends, update fee tiers, oracle feeds, treasury, burn split, the fee token, and the supported-token allowlist. It **cannot** access funds, change recipients, block settled claims, or mint VEK.

### What happens if the protocol is paused?

New sends stop; existing transfers can still be claimed or rejected. Funds are never trapped.

---

## Integration

### Do I need a special SDK?

No — it's a standard contract. Use ethers.js, viem, web3.js, etc. See the [Integration Guide](./integration-guide.md).

### How do I monitor for incoming transfers?

Watch **both** `InstantTransfer` (immediate) and `TransferCreated` (scheduled), filtered by your address as recipient. There is no single `TransferSent` event.

### Is there a testnet deployment?

Contact the team for testnet addresses.

### Can I integrate from a smart contract?

Yes. Import an `IVektes` interface and call directly (ensure your contract holds approvals):

```solidity
interface IVektes {
    function send(address token, address to, uint256 amount, bytes32 txCode, uint256 settlementDate) external;
    function claim(address sender, bytes32 txCode) external;
    function rejectTransfer(address sender, bytes32 txCode) external;
}
```
