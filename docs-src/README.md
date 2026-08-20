# Vektes Protocol

> Programmable, irrevocable token transfers with built-in deduplication, optional settlement scheduling, and recipient controls.

## What is Vektes?

Vektes is an on-chain settlement protocol that brings payment-grade guarantees to EVM token transfers. It wraps ERC-20 and native ETH movements in a thin coordination layer that prevents duplicate sends, can enforce a settlement window, and lets recipients reject inbound scheduled funds.

Think of it as **wire-transfer semantics for smart contracts**.

---

## Core Primitives

| Primitive | Description |
|-----------|-------------|
| **Deduplication** | Every transfer is keyed by `(sender, recipient, txCode)`. A code can only be used once per **sender→recipient pair** — replay and double-send revert at the protocol level. |
| **Instant or scheduled** | `settlementDate = 0` (or any past time) delivers immediately. A future `settlementDate` locks the funds in the contract until then, when the recipient can claim. |
| **Irrevocability** | Once submitted, the sender cannot cancel, reverse, or redirect a transfer — the same finality as a bank wire. |
| **Recipient Rejection** | For a scheduled transfer, the recipient may call `rejectTransfer()` to return the funds to the sender (before claiming). Only the recipient — never the sender. |
| **Multi-Asset** | Any allowlisted ERC-20 via `send()`, or native ETH via `sendNative()`. The recipient always receives the full amount; any fee is charged separately in $VEK. |

---

## How It Works

**Instant transfer** (`settlementDate = 0`):

```
Sender ── send(token, to, amount, txCode, 0) ──▶ Vektes ──▶ Recipient (delivered in the same tx)
```

**Scheduled transfer** (future `settlementDate`):

```
Sender ── send(..., settlementDate) ──▶ Vektes  (funds locked)
                                          │  (settlement date passes)
Recipient ── claim(sender, txCode) ──────▶│──▶ funds released to recipient
   or ────── rejectTransfer(...) ─────────▶│──▶ funds refunded to sender
```

1. **Sender** calls `send()` / `sendNative()` with a unique code and a settlement date (`0` = instant).
2. Instant transfers are delivered immediately; scheduled transfers are held and the transfer is now **irrevocable** from the sender's side.
3. For scheduled transfers, after the date the **recipient** calls `claim()`.
4. Alternatively the recipient calls `rejectTransfer()` to refund the sender.

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

---

## Status

Live on Ethereum mainnet, audited by **CertiK**, and owned by a 2-of-3 Gnosis Safe multisig (`Ownable2Step`). The contract is immutable (non-upgradeable). The protocol currently runs **fee-free** — all fee tiers are set to `0` on-chain, with the tier mechanism available for later activation by governance. See [Security](./security.md) and [Fee Model](./fee-model.md).
