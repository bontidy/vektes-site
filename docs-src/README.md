# Vektes Protocol

> Programmable, irrevocable token transfers with built-in deduplication, optional settlement scheduling, and recipient controls.

## What is Vektes?

Vektes is an on-chain settlement protocol that brings payment-grade guarantees to EVM token transfers. It wraps ERC-20 and native ETH movements in a thin coordination layer that prevents duplicate sends, can enforce a settlement window, and lets recipients reject inbound scheduled funds. v2 adds sending to a **link** instead of an address, one-link **airdrops**, and **recurring allowances** (crypto direct debit).

Think of it as **wire-transfer semantics for smart contracts**.

**Current contract:** Vektes Protocol v2 — `0x1340cf73cbF9d62eDfC7ECCea49aCdbA420EAd34` on Ethereum mainnet, CertiK-audited. (The [v1 contract](./protocol-reference-v1.md) stays live for transfers already scheduled on it.)

---

## Core Primitives

| Primitive | Description |
|-----------|-------------|
| **Deduplication** | Every record is keyed by `(sender, counterparty, txCode)`. A code can only be used once per **sender→counterparty pair** — replay and double-send revert at the protocol level. |
| **Instant or scheduled** | `settlementDate = 0` (or any past time) delivers immediately. A future `settlementDate` locks the funds in the contract until then, after which **anyone** can release them to the recipient. |
| **Irrevocability** | Once submitted, the sender cannot cancel, reverse, or redirect a transfer — the same finality as a bank wire. The sender may only bring the date *earlier*. |
| **Recipient Rejection** | For a scheduled transfer, the recipient may call `reject()` at any time before release to return the funds to the sender. Only the recipient — never the sender. |
| **Never stranded** | A payout that cannot be delivered (a contract that can't take ETH, a token that froze the address) is delivered as WETH or credited for the beneficiary to `withdraw()` — it never reverts and never gets stuck. |
| **Multi-Asset** | Any allowlisted ERC-20 via `send()` (or `sendWithPermit()` for one-signature sends), or native ETH via `sendNative()`. Any fee is taken **in-kind** from the asset sent — no $VEK needed. Fees are 0 today. |
| **Send by link** | Lock a payment to a one-time key and share it as a link; the holder claims to any wallet (front-run-safe), the sender reclaims after expiry. |
| **Airdrops** | One link, many claims: a pool with a fixed amount per claim, once per wallet. |
| **Recurring allowances** | A customer authorises a merchant to pull a fixed amount each period — required end date, arrears cap, cancel or renew anytime. |

---

## How It Works

**Instant transfer** (`settlementDate = 0`):

```
Sender ── send(token, to, amount, txCode, 0, maxFee) ──▶ Vektes ──▶ Recipient (delivered in the same tx)
```

**Scheduled transfer** (future `settlementDate`):

```
Sender ── send(..., settlementDate, maxFee) ──▶ Vektes  (funds locked)
                                                 │  (settlement date passes)
Anyone ──── release(sender, recipient, txCode) ─▶│──▶ funds pushed to the recipient
Recipient ─ reject(sender, txCode) ─────────────▶│──▶ funds refunded to the sender (any time before release)
```

1. **Sender** calls `send()` / `sendNative()` with a unique code and a settlement date (`0` = instant).
2. Instant transfers are delivered immediately; scheduled transfers are held and are now **irrevocable** from the sender's side.
3. After the date, **anyone** — the sender, the recipient, or a keeper — calls `release()`.
4. Alternatively the recipient calls `reject()` to refund the sender.

---

## Quick Links

- [Quick Start →](./quick-start.md)
- [Protocol Reference →](./protocol-reference.md)
- [Fee Model →](./fee-model.md)
- [Integration Guide →](./integration-guide.md)
- [Contract Addresses →](./contracts.md)
- [Security →](./security.md)
- [FAQ →](./faq.md)

---

## Who Uses Vektes?

- **Payment platforms** that need wire-like finality without custodial risk
- **Treasury operations** batching disbursements to known settlement dates
- **B2B invoicing** where duplicate-payment prevention matters
- **Payroll** flows needing scheduled, non-reversible payouts
- **Subscriptions** that want card-like recurring billing on-chain

---

## Status

v2 is live on Ethereum mainnet, audited by **CertiK** (tag `audit-2.6.0`, final report 2026-09-11, 0 Critical / 0 Major), and owned by a 2-of-3 Gnosis Safe multisig (`Ownable2Step`). The contract is immutable (non-upgradeable). The protocol currently runs **fee-free** — all fee tiers are `0` on-chain, with the tier mechanism (capped at 1%) available for later activation. See [Security](./security.md) and [Fee Model](./fee-model.md).
