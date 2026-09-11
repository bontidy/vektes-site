# FAQ

Common questions about the Vektes protocol (v2).

---

## General

### What is Vektes?

Vektes is an on-chain settlement protocol that adds wire-transfer-style guarantees to EVM token transfers — deduplication, optional settlement scheduling, sender-irrevocability, and recipient rejection — plus send-by-link, airdrops and recurring allowances in v2.

### What problem does it solve?

Plain ERC-20 `transfer()` is fire-and-forget. Vektes adds:
- **Deduplication** — a code, unique per **sender→recipient** pair, makes double-sends impossible.
- **Settlement windows** — optionally hold funds until a chosen date.
- **Irrevocability** — senders can't claw back (same guarantee as a bank wire).
- **Recipient controls** — recipients can reject a pending (scheduled) transfer.

### Is Vektes custodial?

No. It's a non-custodial, immutable smart contract. For instant transfers funds pass straight through to the recipient; for scheduled transfers they're held by the contract until released to the fixed recipient (by anyone) or rejected (by the recipient). No party — including the owner — can redirect, seize or hold funds.

### v1 or v2?

**v2** (`0x1340…Ad34`) is the current contract; all new integrations should use it. v1 (`0xd055…E8B7`) stays live and immutable so transfers scheduled on it can still be claimed or rejected there. They share no state.

---

## Transfers

### Instant or scheduled — what's the difference?

If `settlementDate <= now` (e.g. `0`), the transfer is **instant**: the recipient gets the funds in the same transaction, and nothing is stored. If `settlementDate` is in the future, it's **scheduled**: funds are held until then, after which anyone calls `release()`.

### Can I cancel a transfer after sending?

No. Transfers are **irrevocable by the sender**. The only way funds return is if the recipient rejects a *scheduled* transfer via `reject()` (which refunds the sender in full). Instant transfers are final on delivery.

### What happens if nobody releases a scheduled transfer?

It stays releasable indefinitely — the sender, the recipient, or any third party can call `release()` at any time after the date, and the funds always go to the recipient. The sender cannot reclaim; the recipient can still `reject()` to refund the sender until it is released.

### What if the recipient can't receive the funds?

A release never fails for that reason. ETH sent to a contract that can't accept it is delivered as **WETH**; an ERC-20 the token refuses to deliver is **credited**, and the recipient pulls it with `withdraw(token, to)` to any address they choose.

### What tokens are supported?

A **curated allowlist** of standard ERC-20s (USDC, USDT and $VEK), plus native ETH via `sendNative()`. Sending a non-allowlisted token reverts with `TokenNotSupported`. Fee-on-transfer and rebasing tokens are intentionally excluded. Check `supportedTokens(token)` first.

### What happens if I reuse a transaction code?

It reverts with `DuplicateTransactionCode(txCode, recipient)`. A code is unique per **`(sender, recipient)`** pair — the same code *can* be reused with a different recipient. Check with `isCodeUsed(sender, recipient, txCode)`.

---

## Settlement

### What does `settlementDate = 0` mean?

Instant delivery — the recipient receives funds immediately in the send transaction. (Any past/current timestamp is treated the same way.)

### Can the settlement date be changed after sending?

Only **earlier**, and only by the sender (`shortenSettlementDate`). It can never be pushed later.

### Can the recipient reject before the settlement date?

Yes. `reject()` works any time before the transfer is released — before or after the settlement date.

---

## Fees

### How much does it cost?

**Currently nothing** — the protocol launched with all fee tiers set to `0`. When fees are activated they're tiered by the **sender's monthly volume** (0.005% / 0.01% / 0.02% above a free tier), capped on-chain at 1%, and taken from the asset being sent. See the [Fee Model](./fee-model.md).

### What token are fees paid in?

**The asset you send.** The recipient receives `amount − fee`. You never need $VEK to transact, and $VEK transfers themselves are fee-exempt.

### Is there a maximum fee?

Yes, two: an **immutable 1% ceiling** (`MAX_FEE_BPS = 1000`) that no configuration can exceed, and a **per-call `maxFee`** you pass on every fee-bearing function (in the transfer asset). The call reverts with `FeeExceedsMax` if the fee would exceed your cap. Note that `maxFee = 0` means "accept no fee at all".

### Are fee tiers based on the transfer size?

No — on the **sender's cumulative volume over a rolling ~30-day window**. Two transfers of the same size can land in different tiers depending on the sender's monthly total.

### Where do fees go?

They accrue inside the contract (separately from user escrow) and can be swept by the owner **only to the treasury** (the Gnosis Safe). Any buy-and-burn of $VEK happens off-chain from swept fees.

### When will fees be activated?

There's no fixed date. Turning fees on is a governance decision, bounded by the 1% ceiling, and would be announced in advance. Until then, transfers are completely free. See [Fee Model → Fee Activation](./fee-model.md#fee-activation).

---

## Releasing & Rejecting

### Who can release?

**Anyone**, once the settlement date has passed — the funds always go to the recipient fixed at send time, so a third party can only complete the intended payment. (Instant transfers need no release.)

### Can I release many transfers at once?

Yes — `releaseMany(senders[], recipients[], txCodes[])`. Entries that aren't due or valid are **skipped**, and an undeliverable payout is credited, so one bad entry never fails the batch.

### How do I reject a transfer?

`reject(sender, txCode)` from the recipient's address — funds return to the original sender. Any time before release.

### Can I partially release?

No. Releases are all-or-nothing; the full net amount goes to the recipient.

---

## Send by link, airdrops, subscriptions

### How does "send by link" work?

You generate a throwaway keypair, lock the payment to its address with `createClaimable`, and share the private key as a link. The holder signs an EIP-712 `Claim` naming their own payout address and calls `claimTo` — because the payout address is inside the signature, nobody can hijack it from the mempool. If the link is never used, you `reclaim` after the expiry you chose.

### Are airdrops sybil-proof?

No. A campaign allows one claim per payout address, which stops accidental double-claims but not someone with many wallets. Share campaign links with known recipients rather than publicly.

### How do recurring allowances differ from an escrow?

Nothing is locked up front. The merchant pulls each period's amount from the customer's wallet via their standing approval, so a charge only succeeds while the customer keeps enough balance and approval — like a card. Orders have a required end date, an arrears cap (older unpaid periods lapse), and the customer can cancel (forfeiting unclaimed periods) or renew at any time.

---

## Security

### Has it been audited?

Yes — v2 by **CertiK** at tag `audit-2.6.0` (final report 2026-09-11): 0 Critical / 0 Major, all code findings resolved. v1 was audited separately. See [Security](./security.md).

### Is the contract upgradeable?

No. Immutable — no proxy, no `delegatecall`.

### What can the owner do?

The owner (a 2-of-3 Gnosis Safe, `Ownable2Step`) can only **configure**: pause/unpause creation of new transfers, update fee tiers (up to 1%), oracle feeds, treasury, fee-exempt flags and the supported-token allowlist, and sweep accrued fees to the treasury. It **cannot** access escrowed funds, change recipients, block a release or rejection, or mint VEK.

### What happens if the protocol is paused?

New sends, claim-links, campaigns and allowances stop; everything already committed can still be released, rejected, claimed, reclaimed, withdrawn or collected. Funds are never trapped.

---

## Integration

### Do I need a special SDK?

No — it's a standard contract. Use ethers.js, viem, web3.js, etc. See the [Integration Guide](./integration-guide.md).

### How do I monitor for incoming transfers?

Watch **both** `InstantTransfer` (immediate) and `TransferCreated` (scheduled), filtered by your address as recipient, then `TransferReleased` / `TransferRejected` for resolution. There is no single `TransferSent` event.

### Is there a testnet deployment?

Yes — the same audited code is on **Sepolia** with open-mint test stablecoins. See `TESTNET.md` in the [contracts repository](https://github.com/bontidy/vektes-contracts).

### Can I integrate from a smart contract?

Yes. Import an interface and call directly (ensure your contract holds approvals, and can receive WETH or call `withdraw` if it will be a recipient):

```solidity
interface IVektesV2 {
    function send(address token, address to, uint256 amount, bytes32 txCode, uint256 settlementDate, uint256 maxFee) external;
    function release(address sender, address recipient, bytes32 txCode) external;
    function reject(address sender, bytes32 txCode) external;
    function withdraw(address token, address to) external;
}
```
