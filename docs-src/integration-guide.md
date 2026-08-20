# Integration Guide

Build a payment application on the Vektes protocol. Covers sending (instant and scheduled), monitoring, claiming, and rejecting.

---

## Setup

```bash
npm install ethers@6
```

```typescript
import { ethers } from "ethers";

// Minimal interface — use the full verified ABI from Etherscan in production.
const VEKTES_ABI = [
  // sends (both overloads)
  "function send(address token, address to, uint256 amount, bytes32 txCode, uint256 settlementDate) external",
  "function send(address token, address to, uint256 amount, bytes32 txCode, uint256 settlementDate, uint256 maxFeeVek) external",
  "function sendNative(address to, bytes32 txCode, uint256 settlementDate) external payable",
  "function sendNative(address to, bytes32 txCode, uint256 settlementDate, uint256 maxFeeVek) external payable",
  // exits
  "function claim(address sender, bytes32 txCode) external",
  "function rejectTransfer(address sender, bytes32 txCode) external",
  "function batchClaim(address[] senders, bytes32[] txCodes) external",
  // views (note: sender + recipient + code)
  "function getTransfer(address sender, address recipient, bytes32 txCode) external view returns (tuple(address token, address sender, address recipient, uint256 amount, uint256 fee, uint256 settlementDate, uint256 createdAt, bytes32 txCode, bool claimed, bool cancelled))",
  "function isClaimable(address sender, address recipient, bytes32 txCode) external view returns (bool)",
  "function isCodeUsed(address sender, address recipient, bytes32 txCode) external view returns (bool)",
  "function previewFee(address sender, address token, uint256 amount) external view returns (uint256)",
  "function getCurrentTier(address sender) external view returns (uint256 tierIndex, uint256 feeBps)",
  "function supportedTokens(address token) external view returns (bool)",
  // events
  "event TransferCreated(bytes32 indexed transferKey, address indexed sender, address indexed recipient, address token, uint256 amount, uint256 fee, bytes32 txCode, uint256 settlementDate, uint256 createdAt)",
  "event InstantTransfer(address indexed sender, address indexed recipient, address token, uint256 amount, uint256 fee, bytes32 txCode, uint256 timestamp)",
  "event TransferClaimed(bytes32 indexed transferKey, address indexed recipient, address token, uint256 amount, uint256 claimedAt)",
  "event TransferRejected(bytes32 indexed transferKey, address indexed recipient, address indexed sender, address token, uint256 amount, uint256 rejectedAt)",
];

const VEKTES_ADDRESS = "0xd0554A67EB0438a28A31adFc8D4CfBb4ec50E8B7";

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
const vektes = new ethers.Contract(VEKTES_ADDRESS, VEKTES_ABI, signer);
```

---

## Sending Transfers

Codes are unique per **sender→recipient** pair — always pass the recipient when checking availability.

```typescript
function generateTxCode(paymentId: string): string {
  return ethers.id(paymentId); // keccak256 → bytes32
}

async function ensureCodeAvailable(recipient: string, code: string): Promise<void> {
  if (await vektes.isCodeUsed(signer.address, recipient, code)) {
    throw new Error("Transaction code already used for this recipient");
  }
}
```

### Send ERC-20

```typescript
async function sendPayment(params: {
  token: string;
  recipient: string;
  amount: bigint;
  paymentId: string;
  settlementDate?: number; // 0/undefined = instant
}) {
  const txCode = generateTxCode(params.paymentId);

  // 1. Token must be supported
  if (!(await vektes.supportedTokens(params.token))) {
    throw new Error("Token not supported by the protocol");
  }

  // 2. Code must be free for this recipient
  await ensureCodeAvailable(params.recipient, txCode);

  // 3. Preview + cap the fee (0 while the protocol is free)
  const fee = await vektes.previewFee(signer.address, params.token, params.amount);

  // 4. Approve the transfer token (and VEK if a fee applies)
  const token = new ethers.Contract(params.token, ERC20_ABI, signer);
  if ((await token.allowance(signer.address, VEKTES_ADDRESS)) < params.amount) {
    await (await token.approve(VEKTES_ADDRESS, params.amount)).wait();
  }
  if (fee > 0n) {
    const vek = new ethers.Contract(VEK_ADDRESS, ERC20_ABI, signer);
    if ((await vek.allowance(signer.address, VEKTES_ADDRESS)) < fee) {
      await (await vek.approve(VEKTES_ADDRESS, fee)).wait();
    }
  }

  // 5. Send (6-arg overload with the fee cap for slippage safety)
  const tx = await vektes.send(
    params.token, params.recipient, params.amount, txCode,
    params.settlementDate ?? 0, fee
  );
  const receipt = await tx.wait();
  return { txHash: receipt.hash, txCode, blockNumber: receipt.blockNumber };
}
```

> **Instant vs scheduled:** `settlementDate ?? 0` delivers immediately (`InstantTransfer`). A future timestamp locks the funds until then (`TransferCreated`), and the recipient claims later.

---

## Listening to Events

Both a send path (`InstantTransfer` for immediate, `TransferCreated` for scheduled) must be watched — there is no single `TransferSent` event.

```typescript
// Incoming to a given recipient — instant deliveries
vektes.on(vektes.filters.InstantTransfer(null, recipient),
  (sender, rcpt, token, amount, fee, txCode, timestamp) => {
    // funds already delivered on-chain
  });

// Incoming to a given recipient — scheduled (claimable later)
vektes.on(vektes.filters.TransferCreated(null, null, recipient),
  (transferKey, sender, rcpt, token, amount, fee, txCode, settlementDate, createdAt) => {
    // notify recipient; claimable at settlementDate
  });

// Claims / rejections on transfers you sent (filter by transferKey if you track it)
vektes.on("TransferClaimed", (transferKey, recipient, token, amount) => { /* ... */ });
vektes.on("TransferRejected", (transferKey, recipient, sender, token, amount) => { /* refund path */ });
```

### Historical query

```typescript
async function getScheduledSent(sender: string, fromBlock: number) {
  const events = await vektes.queryFilter(vektes.filters.TransferCreated(null, sender), fromBlock, "latest");
  return events.map((e) => ({
    recipient: e.args.recipient, token: e.args.token, amount: e.args.amount,
    txCode: e.args.txCode, settlementDate: e.args.settlementDate, blockNumber: e.blockNumber,
  }));
}
```

---

## Claiming & Rejecting (recipient)

```typescript
async function claimTransfer(sender: string, recipient: string, txCode: string) {
  if (!(await vektes.isClaimable(sender, recipient, txCode))) {
    const t = await vektes.getTransfer(sender, recipient, txCode);
    if (t.amount === 0n) throw new Error("No such scheduled transfer");
    if (t.claimed) throw new Error("Already claimed");
    if (t.cancelled) throw new Error("Rejected");
    throw new Error(`Not settled until ${t.settlementDate}`);
  }
  return (await vektes.claim(sender, txCode)).wait(); // caller must be the recipient
}

// batchClaim SKIPS non-claimable entries (does not revert the whole batch)
async function claimAll(items: Array<{ sender: string; recipient: string; txCode: string }>) {
  const ready = [];
  for (const t of items) if (await vektes.isClaimable(t.sender, t.recipient, t.txCode)) ready.push(t);
  if (!ready.length) return null;
  return (await vektes.batchClaim(ready.map((t) => t.sender), ready.map((t) => t.txCode))).wait();
}

async function rejectIncoming(sender: string, txCode: string) {
  return (await vektes.rejectTransfer(sender, txCode)).wait(); // refunds the sender
}
```

---

## Transfer Status State Machine

```typescript
type TransferStatus = "delivered" | "pending" | "claimable" | "claimed" | "rejected";

async function getStatus(sender: string, recipient: string, txCode: string): Promise<TransferStatus> {
  const t = await vektes.getTransfer(sender, recipient, txCode);
  if (t.amount === 0n) return "delivered"; // no record ⇒ it was an instant transfer (already delivered)
  if (t.claimed) return "claimed";
  if (t.cancelled) return "rejected";
  const now = Math.floor(Date.now() / 1000);
  return now < Number(t.settlementDate) ? "pending" : "claimable";
}
```

> A zero record means either the transfer never existed **or** it was instant (instant transfers aren't stored). Disambiguate with the `InstantTransfer` event / your own send log if you need certainty.

---

## Error Handling

Use the **real** custom-error names:

```typescript
const iface = new ethers.Interface(VEKTES_ERROR_ABI); // include the error fragments
try {
  await sendPayment(params);
} catch (error: any) {
  const decoded = error.data ? iface.parseError(error.data) : null;
  switch (decoded?.name) {
    case "DuplicateTransactionCode": throw new Error("Code already used for this recipient.");
    case "TokenNotSupported":        throw new Error("This token isn't enabled on the protocol.");
    case "ZeroAddress":              throw new Error("Invalid recipient address.");
    case "ZeroAmount":               throw new Error("Amount must be greater than zero.");
    case "FeeExceedsMax":            throw new Error("Fee moved above your cap — re-quote and retry.");
    case "StalePrice":
    case "PriceFeedNotSet":          throw new Error("Price feed unavailable for this token right now.");
    case "EnforcedPause":            throw new Error("New transfers are paused.");
    default: if (error.code === "INSUFFICIENT_FUNDS") throw new Error("Insufficient gas balance."); throw error;
  }
}
```

---

## Webhook / Indexer Pattern (server-side)

```typescript
const provider = new ethers.WebSocketProvider(process.env.WS_RPC_URL!);
const vektes = new ethers.Contract(VEKTES_ADDRESS, VEKTES_ABI, provider);

vektes.on("InstantTransfer", async (sender, recipient, token, amount, fee, txCode) => {
  await db.transfers.upsert({ sender, recipient, token, amount: amount.toString(), txCode, status: "delivered" });
  await notifications.send(recipient, { type: "payment_received", sender, amount: amount.toString(), token });
});

vektes.on("TransferCreated", async (key, sender, recipient, token, amount, fee, txCode, settlementDate) => {
  await db.transfers.upsert({ key, sender, recipient, token, amount: amount.toString(), txCode,
    settlementDate: Number(settlementDate), status: "pending" });
});

vektes.on("TransferClaimed",  async (key) => { await db.transfers.update({ key }, { status: "claimed" }); });
vektes.on("TransferRejected", async (key) => { await db.transfers.update({ key }, { status: "rejected" }); });
```

---

## Next Steps

- [Protocol Reference →](./protocol-reference.md) — full function signatures
- [Fee Model →](./fee-model.md) — fees, `previewFee`, and `maxFeeVek`
- [Contract Addresses →](./contracts.md) — mainnet addresses and supported tokens
