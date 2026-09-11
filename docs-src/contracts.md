# Contract Addresses

All Vektes protocol contracts deployed on Ethereum mainnet.

---

## Mainnet Deployments

| Contract | Address | Description |
|----------|---------|-------------|
| **Vektes Protocol v2** — current | `0x1340cf73cbF9d62eDfC7ECCea49aCdbA420EAd34` | `VektesProtocolV2` — deployed 2026-09-11 from CertiK-audited tag `audit-2.6.0`. Permissionless release, in-kind fees, claim-by-link, airdrop campaigns, recurring allowances. **Use this for new integrations.** |
| **Vektes Protocol v1** — legacy | `0xd0554A67EB0438a28A31adFc8D4CfBb4ec50E8B7` | `VektesProtocol` — live and immutable; transfers scheduled on it are still claimed on it. No new integrations. |
| **VEK Token** | `0xb4fa28e9dBA552dF8a55579Bc9494f0F7486d215` | ERC-20 utility token (unchanged across versions — no migration) |
| **Gnosis Safe (Owner + Treasury)** | `0xBdCDb466c70E21A985E7eA02Be6E838aD5c00207` | 2-of-3 multisig that owns the protocol contracts and receives protocol fees |

> **v2 is a separate contract, not an upgrade.** It shares no state with v1. Anything you scheduled on v1 stays on v1 (claim/reject there); anything new goes to v2. The token and vesting are untouched.

---

## Etherscan Links

- **Protocol v2:** [etherscan.io/address/0x1340cf73cbF9d62eDfC7ECCea49aCdbA420EAd34](https://etherscan.io/address/0x1340cf73cbF9d62eDfC7ECCea49aCdbA420EAd34#code)
- **Protocol v1 (legacy):** [etherscan.io/address/0xd0554A67EB0438a28A31adFc8D4CfBb4ec50E8B7](https://etherscan.io/address/0xd0554A67EB0438a28A31adFc8D4CfBb4ec50E8B7#code)
- **VEK Token:** [etherscan.io/token/0xb4fa28e9dBA552dF8a55579Bc9494f0F7486d215](https://etherscan.io/token/0xb4fa28e9dBA552dF8a55579Bc9494f0F7486d215)
- **Gnosis Safe:** [app.safe.global/eth:0xBdCDb466c70E21A985E7eA02Be6E838aD5c00207](https://app.safe.global/home?safe=eth:0xBdCDb466c70E21A985E7eA02Be6E838aD5c00207)

---

## Contract Configuration

### Protocol v2 (`VektesProtocolV2`) — current

```
Owner:            0xBdCDb466c70E21A985E7eA02Be6E838aD5c00207 (Gnosis Safe, Ownable2Step)
Treasury:         0xBdCDb466c70E21A985E7eA02Be6E838aD5c00207 (Gnosis Safe)
Fee model:        in-kind — taken from the asset being sent (never in VEK); recipient gets amount − fee
Fee ceiling:      MAX_FEE_BPS = 1000 (1%, immutable); every fee-bearing call takes a caller `maxFee` cap
Fee status:       all tiers 0 bps (fee-free launch); $VEK transfers are fee-exempt
WETH:             0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 (un-deliverable ETH is delivered as WETH)
Pausable:         Yes (owner-only; only new sends/claimables/campaigns/allowances pause — release, reject,
                  reclaim, withdraw and allowance collection never pause)
Upgradeable:      No (immutable deployment — no proxy, no delegatecall)
Audit:            CertiK, tag audit-2.6.0, final 2026-09-11 — 0 Critical / 0 Major
```

Key behavioural differences from v1: after the settlement date **anyone** may `release()` a scheduled
transfer to its fixed recipient (no `claim()`); the recipient may `reject()` at any time before release;
a payout that cannot be delivered is credited and pulled with `withdraw(token, to)`. Full function
reference: the verified source on Etherscan and the
[contracts repository](https://github.com/bontidy/vektes-contracts) (`FEATURES.md`, `TESTNET.md`).

### Protocol v1 (`VektesProtocol`) — legacy

```
Owner:            0xBdCDb466c70E21A985E7eA02Be6E838aD5c00207 (Gnosis Safe, Ownable2Step)
Treasury:         0xBdCDb466c70E21A985E7eA02Be6E838aD5c00207 (Gnosis Safe)
Fee token:        0xb4fa28e9dBA552dF8a55579Bc9494f0F7486d215 (VEK)
Burn percentage:  50  (share of each fee burned; remainder to treasury; owner-adjustable 0–100)
Pausable:         Yes (owner-only; only send/sendNative pause — claims/rejections never pause)
Upgradeable:      No (immutable deployment — no proxy, no delegatecall)
```

> **Fee status:** the protocol launched **fee-free** — every fee tier is currently set to `0` on-chain, so no protocol fee is charged today. The tier *mechanism* exists and can be activated later by the owner via `updateFeeTier`. See [Fee Model](./fee-model.md).

### VEK Token (`VektesToken`)

```
Name / Symbol:   Vektes / VEK
Standard:        ERC-20 + ERC20Burnable + ERC20Permit (EIP-2612)
Decimals:        18
Total Supply:    1,000,000,000 VEK (fixed)
Mintable:        No — the entire supply was minted at deployment; there is no mint function
Burnable:        Yes (ERC20Burnable; protocol fees are also burned to 0x…dEaD)
```

---

## Supported Tokens

Transfers use a **curated allowlist** — only tokens the owner has enabled via `setTokenSupport` can be sent with `send()`. Sending an unsupported token reverts with `TokenNotSupported(token)`.

| Token | Status | Notes |
|-------|--------|-------|
| USDC (`0xA0b8…eB48`) | ✅ Supported | Chainlink USDC/USD feed registered |
| USDT (`0xdAC1…1ec7`) | ✅ Supported | Chainlink USDT/USD feed registered |
| Native ETH | ✅ Always available via `sendNative()` | Not in the allowlist (native is exempt), but priced by the ETH/USD feed |
| Other ERC-20s | ❌ Not enabled | Owner may add standard ERC-20s over time |

> Only standard ERC-20s are eligible — **fee-on-transfer and rebasing tokens are intentionally not supported.** Check `supportedTokens(token)` before sending, or handle the `TokenNotSupported` revert.

---

## Integration Checklist

When integrating with Vektes, your application interacts with:

1. **Vektes Protocol v2** (`0x1340…Ad34`) — for `send()`, `release()`, `reject()`, `getTransfer()`, etc.
2. **The ERC-20 token being transferred** — `approve()` the protocol before sending. On v2 the fee (if any) is taken from this same asset, so **no VEK approval is needed**.

```typescript
// Minimal setup (v2)
const VEKTES = "0x1340cf73cbF9d62eDfC7ECCea49aCdbA420EAd34";
const USDC   = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

// Approve the transfer token (approve the exact amount rather than MaxUint256 where practical)
const usdc = new ethers.Contract(USDC, ERC20_ABI, signer);
await usdc.approve(VEKTES, amount);

// Send with a fee cap in the transfer asset. 1% is the contract's own immutable ceiling (MAX_FEE_BPS = 1000);
// fees are 0 today, so this never binds — but never pass 0, which on v2 means "accept no fee at all".
await vektes["send(address,address,uint256,bytes32,uint256,uint256)"](USDC, to, amount, txCode, 0, amount * 1000n / 100000n);
```

---

## Network Details

| Parameter | Value |
|-----------|-------|
| Chain | Ethereum Mainnet |
| Chain ID | 1 |
| Block Explorer | etherscan.io |

> **Note:** Vektes is currently deployed on Ethereum mainnet only. Multi-chain deployments are planned for future releases.
