# Quick Start

Send your first transfer through the Vektes protocol in a few minutes.

---

## Prerequisites

- An EVM wallet with ETH for gas plus the token you want to send
- The token must be **on the supported-token allowlist** (currently USDC, USDT; native ETH always works)
- Approve the protocol to spend the token (standard ERC-20 `approve`)
- A unique transaction code (`bytes32`) — your dedup key, unique per **sender→recipient** pair
- VEK for fees **only if fees are active** (they are currently `0` — see [Fee Model](./fee-model.md))

---

## 1. Approve the Token

```typescript
// ethers.js v6
const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
await token.approve("0xd0554A67EB0438a28A31adFc8D4CfBb4ec50E8B7", amount);
```

---

## 2. Send a Transfer

### Instant ERC-20 transfer (`settlementDate = 0`)

With `settlementDate = 0`, the recipient receives the funds **immediately, in the same transaction** — there's nothing to claim.

```typescript
const vektes = new ethers.Contract(VEKTES_ADDRESS, VEKTES_ABI, signer);

const txCode = ethers.id("INV-2026-0042"); // bytes32, unique for this recipient

const tx = await vektes.send(
  USDC_ADDRESS,      // token (must be supported)
  recipientAddress,  // to
  1_000_000n,        // amount (1 USDC, 6 decimals)
  txCode,            // unique code (per sender→recipient)
  0                  // settlementDate: 0 = instant delivery
);
await tx.wait();
console.log("Delivered:", tx.hash);
```

To protect against fee slippage once fees are active, use the 6-argument overload with a `maxFeeVek` cap (quote it via `previewFee`):

```typescript
const fee = await vektes.previewFee(signer.address, USDC_ADDRESS, 1_000_000n);
await vektes.send(USDC_ADDRESS, recipientAddress, 1_000_000n, txCode, 0, fee);
```

### Scheduled transfer (future settlement)

With a future `settlementDate`, funds are **held in the contract** until that time, then the recipient claims.

```typescript
const settlementDate = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // +7 days
await vektes.send(USDC_ADDRESS, recipientAddress, 1_000_000n, txCode, settlementDate);
```

### Native ETH

```typescript
const tx = await vektes.sendNative(
  recipientAddress,
  txCode,
  0,                                    // 0 = instant
  { value: ethers.parseEther("0.5") }
);
```

---

## 3. Claim a Scheduled Transfer (recipient)

Only needed for **scheduled** transfers, once the settlement date has passed. (Instant transfers are already delivered — no claim.)

```typescript
const vektes = new ethers.Contract(VEKTES_ADDRESS, VEKTES_ABI, recipientSigner);
const tx = await vektes.claim(senderAddress, txCode);
await tx.wait();
console.log("Funds claimed!");
```

The recipient can instead `rejectTransfer(senderAddress, txCode)` at any time before claiming, which refunds the sender.

---

## 4. Check Transfer Status (optional)

All lookups take **sender, recipient, and code**:

```typescript
// Scheduled transfers only — instant transfers are not stored (track them via the InstantTransfer event)
const t = await vektes.getTransfer(senderAddress, recipientAddress, txCode);
console.log(t);
// { token, sender, recipient, amount, fee, settlementDate, createdAt, txCode, claimed, cancelled }

const claimable = await vektes.isClaimable(senderAddress, recipientAddress, txCode);
console.log("Claimable now:", claimable);
```

---

## Transaction Code Best Practices

`txCode` is a `bytes32` that uniquely identifies a transfer **for a given sender→recipient pair**. The same code can be reused with a *different* recipient.

| Strategy | Example |
|----------|---------|
| Hash an invoice ID | `ethers.id("INV-2026-0042")` |
| Hash a UUID | `ethers.id("550e8400-e29b-41d4-a716-446655440000")` |
| Incremental counter | `ethers.zeroPadValue(ethers.toBeHex(nonce), 32)` |

```typescript
// Check availability before sending (sender, recipient, code)
const used = await vektes.isCodeUsed(signer.address, recipientAddress, txCode);
```

> ⚠️ **Important:** reusing a code for the *same* recipient reverts with `DuplicateTransactionCode(txCode, recipient)`.

---

## Next Steps

- [Protocol Reference →](./protocol-reference.md) — full function signatures and parameters
- [Fee Model →](./fee-model.md) — how fees work (and why they're currently free)
- [Integration Guide →](./integration-guide.md) — build a full payment flow
