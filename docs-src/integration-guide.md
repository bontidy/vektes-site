# Integration Guide

Build a payment application on Vektes Protocol v2. Covers sending (instant and scheduled), monitoring, releasing and rejecting, undeliverable payouts, and the link, airdrop and recurring-allowance flows.

> Integrating against the previous contract? See the [v1 reference](./protocol-reference-v1.md). Transfers scheduled on v1 stay on v1; everything new goes to v2.

---

## Setup

```bash
npm install ethers@6
```

```typescript
import { ethers } from "ethers";

// Minimal interface — use the full verified ABI from Etherscan in production.
const VEKTES_ABI = [
  // sends
  "function send(address token, address to, uint256 amount, bytes32 txCode, uint256 settlementDate) external",
  "function send(address token, address to, uint256 amount, bytes32 txCode, uint256 settlementDate, uint256 maxFee) external",
  "function sendWithPermit(address token, address to, uint256 amount, bytes32 txCode, uint256 settlementDate, uint256 maxFee, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
  "function sendNative(address to, bytes32 txCode, uint256 settlementDate) external payable",
  "function sendNative(address to, bytes32 txCode, uint256 settlementDate, uint256 maxFee) external payable",
  // resolution (all permissionless or recipient/sender-only by key; none pausable)
  "function release(address sender, address recipient, bytes32 txCode) external",
  "function releaseMany(address[] senders, address[] recipients, bytes32[] txCodes) external",
  "function reject(address sender, bytes32 txCode) external",
  "function shortenSettlementDate(address recipient, bytes32 txCode, uint256 newDate) external",
  "function withdraw(address token, address to) external",
  // views (note: sender + recipient + code)
  "function getTransfer(address sender, address recipient, bytes32 txCode) external view returns (tuple(address token, address sender, address recipient, uint256 amount, uint256 fee, uint256 settlementDate, uint256 createdAt, bytes32 txCode, bool released, bool rejected, uint256 usdVolume, uint256 volumePeriod))",
  "function isReleasable(address sender, address recipient, bytes32 txCode) external view returns (bool)",
  "function isCodeUsed(address sender, address recipient, bytes32 txCode) external view returns (bool)",
  "function previewFee(address sender, address token, uint256 amount) external view returns (uint256)",
  "function getCurrentTier(address sender) external view returns (uint256 tierIndex, uint256 feeBps)",
  "function supportedTokens(address token) external view returns (bool)",
  "function withdrawable(address beneficiary, address token) external view returns (uint256)",
  // events
  "event InstantTransfer(address indexed sender, address indexed recipient, address token, uint256 amount, uint256 fee, bytes32 txCode, uint256 timestamp)",
  "event TransferCreated(bytes32 indexed transferKey, address indexed sender, address indexed recipient, address token, uint256 amount, uint256 fee, bytes32 txCode, uint256 settlementDate, uint256 createdAt)",
  "event TransferReleased(bytes32 indexed transferKey, address indexed recipient, address indexed caller, address token, uint256 amount, uint256 timestamp)",
  "event TransferRejected(bytes32 indexed transferKey, address indexed recipient, address indexed sender, address token, uint256 amount, uint256 rejectedAt)",
  "event PayoutWrapped(address indexed beneficiary, uint256 amount)",
  "event PayoutDeferred(address indexed beneficiary, address indexed token, uint256 amount)",
  "event Withdrawn(address indexed beneficiary, address indexed token, address to, uint256 amount)",
];

const VEKTES_ADDRESS = "0x1340cf73cbF9d62eDfC7ECCea49aCdbA420EAd34"; // v2, Ethereum mainnet
const WETH           = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
const vektes = new ethers.Contract(VEKTES_ADDRESS, VEKTES_ABI, signer);

// The 1% protocol ceiling (MAX_FEE_BPS = 1000). A safe maxFee that can never spuriously revert.
const maxFeeFor = (amount: bigint) => amount * 1000n / 100000n;
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
  amount: bigint;          // pulled from the sender; the recipient receives amount − fee
  paymentId: string;
  settlementDate?: number; // 0/undefined = instant
}) {
  const txCode = generateTxCode(params.paymentId);

  // 1. Token must be supported
  if (!(await vektes.supportedTokens(params.token))) throw new Error("Token not supported by the protocol");

  // 2. Code must be free for this recipient
  await ensureCodeAvailable(params.recipient, txCode);

  // 3. Fee cap. previewFee() is exact today; the 1% ceiling is the robust choice for a service.
  //    NEVER pass 0 — on v2 that means "accept no fee" and reverts as soon as a tier is non-zero.
  const maxFee = maxFeeFor(params.amount);

  // 4. Approve the transfer token (exact amount; no VEK approval is ever needed on v2)
  const token = new ethers.Contract(params.token, ERC20_ABI, signer);
  if ((await token.allowance(signer.address, VEKTES_ADDRESS)) < params.amount) {
    await (await token.approve(VEKTES_ADDRESS, params.amount)).wait();
  }

  // 5. Send (6-arg overload; name the signature explicitly because `send` is overloaded)
  const tx = await vektes["send(address,address,uint256,bytes32,uint256,uint256)"](
    params.token, params.recipient, params.amount, txCode, params.settlementDate ?? 0, maxFee
  );
  const receipt = await tx.wait();
  return { txHash: receipt.hash, txCode, blockNumber: receipt.blockNumber };
}
```

> **Instant vs scheduled:** `settlementDate ?? 0` delivers immediately (`InstantTransfer`). A future timestamp locks the funds until then (`TransferCreated`); after the date anyone may release them.

### One-signature send (ERC-2612)

For permit-capable tokens such as USDC, skip the separate approval:

```typescript
const deadline = Math.floor(Date.now() / 1000) + 3600;
const { v, r, s } = await signPermit(usdc, signer, VEKTES_ADDRESS, amount, deadline); // standard EIP-2612 helper
await vektes.sendWithPermit(usdc.target, recipient, amount, txCode, 0, maxFeeFor(amount), deadline, v, r, s);
```

---

## Listening to Events

Watch **both** send paths (`InstantTransfer` for immediate, `TransferCreated` for scheduled) — there is no single `TransferSent` event.

```typescript
// Incoming to a given recipient — instant deliveries
vektes.on(vektes.filters.InstantTransfer(null, recipient),
  (sender, rcpt, token, amount, fee, txCode, timestamp) => { /* funds already delivered */ });

// Incoming to a given recipient — scheduled (releasable later)
vektes.on(vektes.filters.TransferCreated(null, null, recipient),
  (transferKey, sender, rcpt, token, amount, fee, txCode, settlementDate, createdAt) => {
    // notify recipient; releasable by anyone at settlementDate
  });

// Resolution of transfers you sent or receive (filter by transferKey if you track it)
vektes.on("TransferReleased", (transferKey, recipient, caller, token, amount) => { /* ... */ });
vektes.on("TransferRejected", (transferKey, recipient, sender, token, amount) => { /* refund path */ });

// Undeliverable payouts (see below)
vektes.on("PayoutWrapped",  (beneficiary, amount) => { /* ETH arrived as WETH */ });
vektes.on("PayoutDeferred", (beneficiary, token, amount) => { /* credited; beneficiary must withdraw() */ });
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

## Releasing & Rejecting

```typescript
// Anyone may release once due — a platform can run this as a keeper for its users.
async function releaseTransfer(sender: string, recipient: string, txCode: string) {
  if (!(await vektes.isReleasable(sender, recipient, txCode))) {
    const t = await vektes.getTransfer(sender, recipient, txCode);
    if (t.amount === 0n) throw new Error("No such scheduled transfer");
    if (t.released) throw new Error("Already released");
    if (t.rejected) throw new Error("Rejected");
    throw new Error(`Not settled until ${t.settlementDate}`);
  }
  return (await vektes.release(sender, recipient, txCode)).wait();
}

// releaseMany SKIPS entries that aren't due/valid, and CREDITS undeliverable payouts — it never reverts on a bad entry.
async function releaseAll(items: Array<{ sender: string; recipient: string; txCode: string }>) {
  const ready = [];
  for (const t of items) if (await vektes.isReleasable(t.sender, t.recipient, t.txCode)) ready.push(t);
  if (!ready.length) return null;
  return (await vektes.releaseMany(ready.map(t => t.sender), ready.map(t => t.recipient), ready.map(t => t.txCode))).wait();
}

// Recipient only; any time before release. Refunds the sender in full (net + fee).
async function rejectIncoming(sender: string, txCode: string) {
  return (await vektes.reject(sender, txCode)).wait();
}
```

---

## Undeliverable Payouts

A release, rejection or reclaim never reverts because the destination can't take the funds:

- **ETH** to a contract without a payable `receive` is **wrapped to WETH and delivered** (`PayoutWrapped`). Nothing to do; the beneficiary holds WETH.
- An **ERC-20** the token refuses to deliver (frozen/blocklisted address) is **credited** (`PayoutDeferred`); the beneficiary pulls it with `withdraw(token, to)` to any address.

```typescript
async function sweepCredits(tokens: string[]) {
  for (const token of tokens) {
    const credit = await vektes.withdrawable(signer.address, token);
    if (credit > 0n) await (await vektes.withdraw(token, signer.address)).wait();
  }
}
```

> If your **recipient is a smart contract**, make sure it can hold WETH or call `withdraw`. Choosing a compatible destination is the sender's responsibility.

---

## Transfer Status State Machine

```typescript
type TransferStatus = "delivered" | "pending" | "releasable" | "released" | "rejected";

async function getStatus(sender: string, recipient: string, txCode: string): Promise<TransferStatus> {
  const t = await vektes.getTransfer(sender, recipient, txCode);
  if (t.amount === 0n) return "delivered"; // no record ⇒ it was an instant transfer (already delivered)
  if (t.released) return "released";
  if (t.rejected) return "rejected";
  const now = Math.floor(Date.now() / 1000);
  return now < Number(t.settlementDate) ? "pending" : "releasable";
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
    case "ZeroAddress":
    case "InvalidRecipient":         throw new Error("Invalid recipient address.");
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

## Claim-by-link (no recipient address)

Send to a **link** instead of an address: generate a throwaway keypair, lock the payment to its address, and share its private key as the link. The holder claims to any wallet by signing an EIP-712 `Claim` with `payoutTo` inside — so a copied signature can't be redirected. After `expiry`, only the sender's `reclaim` works.

```typescript
const key = ethers.Wallet.createRandom();               // the link IS this key
const expiry = Math.floor(Date.now() / 1000) + 30 * 86400;
await (await usdc.approve(VEKTES_ADDRESS, amount)).wait();
await vektes.createClaimable(usdc.target, amount, txCode, key.address, expiry, maxFeeFor(amount));
// share: key.privateKey + { sender, txCode }

// Claimant side (any wallet pays gas; funds go to payoutTo):
const domain = { name: "VektesProtocolV2", version: "2", chainId: 1, verifyingContract: VEKTES_ADDRESS };
const types  = { Claim: [{ name: "sender", type: "address" }, { name: "claimAddr", type: "address" },
                         { name: "txCode", type: "bytes32" }, { name: "payoutTo", type: "address" }] };
const sig = await new ethers.Wallet(linkPrivateKey).signTypedData(domain, types, { sender, claimAddr: key.address, txCode, payoutTo });
await vektes.claimTo(sender, key.address, txCode, payoutTo, sig);
```

Airdrop **campaigns** work the same way with one shared key and a fixed `amountPerClaim`, one claim per payout address (`createCampaign` / `claimCampaign` / `topUpCampaign` / `reclaimCampaign`).

---

## Recurring Allowances (subscriptions / direct debit)

The customer authorises once; the merchant pulls a fixed amount each period from the customer's wallet. Nothing is escrowed — each pull draws on the customer's balance and standing approval, so it is best-effort like a card charge.

```typescript
// Customer: approve a standing allowance, then create the order (required end date, arrears cap)
await (await usdc.approve(VEKTES_ADDRESS, ethers.MaxUint256)).wait();
await vektes.createAllowance(usdc.target, merchant, 10_000_000n /* 10 USDC */, 30 * 86400 /* monthly */,
                             0 /* first charge now */, oneYearFromNow, 3 /* maxArrears */, txCode);

// Merchant: each cycle
const [periodsDue, gross] = await vektes.previewAllowanceClaim(customer, merchant, txCode);
if (periodsDue > 0n) await (await vektes.claimAllowance(customer, merchant, txCode, maxFeeFor(gross))).wait();

// Customer: cancel (forfeits unclaimed periods) or renew
await vektes.cancelAllowance(merchant, txCode);
await vektes.extendAllowance(merchant, txCode, twoYearsFromNow);
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

vektes.on("TransferReleased", async (key) => { await db.transfers.update({ key }, { status: "released" }); });
vektes.on("TransferRejected", async (key) => { await db.transfers.update({ key }, { status: "rejected" }); });
```

A keeper that calls `releaseMany` for due transfers is a natural addition to this loop — releases are permissionless.

---

## Next Steps

- [Protocol Reference →](./protocol-reference.md) — full function signatures
- [Fee Model →](./fee-model.md) — in-kind fees, `previewFee`, and `maxFee`
- [Contract Addresses →](./contracts.md) — mainnet addresses and supported tokens
