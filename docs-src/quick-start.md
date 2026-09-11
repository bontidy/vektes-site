# Quick Start

Send your first transfer through Vektes Protocol v2 in a few minutes.

---

## Prerequisites

- An EVM wallet with ETH for gas plus the token you want to send
- The token must be **on the supported-token allowlist** (USDC, USDT, $VEK; native ETH always works)
- Approve the protocol to spend the token (standard ERC-20 `approve`) — or use `sendWithPermit` for ERC-2612 tokens
- A unique transaction code (`bytes32`) — your dedup key, unique per **sender→recipient** pair
- **No $VEK is ever needed.** Any fee is taken from the asset you send, and fees are currently `0` — see [Fee Model](./fee-model.md)

```typescript
const VEKTES_ADDRESS = "0x1340cf73cbF9d62eDfC7ECCea49aCdbA420EAd34"; // v2, Ethereum mainnet
const USDC_ADDRESS   = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const MAX_FEE = (amount: bigint) => amount * 1000n / 100000n;         // the 1% protocol ceiling — never pass 0
```

---

## 1. Approve the Token

```typescript
// ethers.js v6
const token = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
await token.approve(VEKTES_ADDRESS, amount);
```

---

## 2. Send a Transfer

### Instant ERC-20 transfer (`settlementDate = 0`)

With `settlementDate = 0`, the recipient receives the funds **immediately, in the same transaction** — there is nothing to release.

```typescript
const vektes = new ethers.Contract(VEKTES_ADDRESS, VEKTES_ABI, signer);

const amount = 1_000_000n;                      // 1 USDC (6 decimals)
const txCode = ethers.id("INV-2026-0042");      // bytes32, unique for this recipient

const tx = await vektes["send(address,address,uint256,bytes32,uint256,uint256)"](
  USDC_ADDRESS,      // token (must be supported)
  recipientAddress,  // to
  amount,            // amount pulled from you; the recipient gets amount − fee (fee is 0 today)
  txCode,            // unique code (per sender→recipient)
  0,                 // settlementDate: 0 = instant delivery
  MAX_FEE(amount)    // maxFee: strict cap on the in-kind fee, in USDC units
);
await tx.wait();
console.log("Delivered:", tx.hash);
```

> `maxFee` is a **strict** cap in the asset you send. `0` means "accept no fee" and will revert the moment fees are switched on. Use the 1% ceiling above, or quote the exact fee with `previewFee(sender, token, amount)`.

### Scheduled transfer (future settlement)

With a future `settlementDate`, funds are **held in the contract** until that time. After it, **anyone** — you, the recipient, or a keeper — can release them to the recipient. Until release the recipient can reject to refund you; you can never claw the funds back.

```typescript
const settlementDate = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // +7 days
await vektes["send(address,address,uint256,bytes32,uint256,uint256)"](
  USDC_ADDRESS, recipientAddress, amount, txCode, settlementDate, MAX_FEE(amount));
```

### Native ETH

```typescript
const value = ethers.parseEther("0.5");
const tx = await vektes["sendNative(address,bytes32,uint256,uint256)"](
  recipientAddress, txCode, 0 /* instant */, MAX_FEE(value), { value });
```

---

## 3. Release a Scheduled Transfer (anyone)

Only needed for **scheduled** transfers, once the settlement date has passed. Instant transfers are already delivered.

```typescript
// Any signer may call this; funds go to the fixed recipient regardless of who calls.
const tx = await vektes.release(senderAddress, recipientAddress, txCode);
await tx.wait();
console.log("Released!");
```

The recipient can instead `reject(senderAddress, txCode)` at any time before release, which refunds the sender in full.

---

## 4. Check Transfer Status (optional)

All lookups take **sender, recipient, and code**:

```typescript
// Scheduled transfers only — instant transfers are not stored (track them via the InstantTransfer event)
const t = await vektes.getTransfer(senderAddress, recipientAddress, txCode);
console.log(t);
// { token, sender, recipient, amount, fee, settlementDate, createdAt, txCode, released, rejected, usdVolume, volumePeriod }

const ready = await vektes.isReleasable(senderAddress, recipientAddress, txCode);
console.log("Releasable now:", ready);
```

---

## Transaction Code Best Practices

`txCode` is a `bytes32` that uniquely identifies a transfer **for a given sender→recipient pair**. The same code can be reused with a *different* recipient.

| Strategy | Example |
|----------|---------|
| Hash an invoice ID | `ethers.id("INV-2026-0042")` |
| Hash a UUID | `ethers.id("550e8400-e29b-41d4-a716-446655440000")` |
| Human-readable (≤ 31 chars) | `ethers.encodeBytes32String("INV-2026-0042")` — what the Vektes app uses |
| Incremental counter | `ethers.zeroPadValue(ethers.toBeHex(nonce), 32)` |

```typescript
// Check availability before sending (sender, recipient, code)
const used = await vektes.isCodeUsed(signer.address, recipientAddress, txCode);
```

> ⚠️ Reusing a code for the *same* recipient reverts with `DuplicateTransactionCode(txCode, recipient)`.

---

## Next Steps

- [Protocol Reference →](./protocol-reference.md) — full function signatures, including claim-by-link, airdrops and recurring allowances
- [Fee Model →](./fee-model.md) — in-kind fees, `previewFee`, and `maxFee`
- [Integration Guide →](./integration-guide.md) — build a full payment flow
