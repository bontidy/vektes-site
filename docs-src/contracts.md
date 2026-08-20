# Contract Addresses

All Vektes protocol contracts deployed on Ethereum mainnet.

---

## Mainnet Deployments

| Contract | Address | Description |
|----------|---------|-------------|
| **Vektes Protocol** | `0xd0554A67EB0438a28A31adFc8D4CfBb4ec50E8B7` | Core protocol contract — handles sends, claims, and rejections |
| **VEK Token** | `0xb4fa28e9dBA552dF8a55579Bc9494f0F7486d215` | ERC-20 fee token (and future governance) |
| **Gnosis Safe (Owner + Treasury)** | `0xBdCDb466c70E21A985E7eA02Be6E838aD5c00207` | 2-of-3 multisig that owns the protocol contract and receives the treasury share of fees |

---

## Etherscan Links

- **Protocol:** [etherscan.io/address/0xd0554A67EB0438a28A31adFc8D4CfBb4ec50E8B7](https://etherscan.io/address/0xd0554A67EB0438a28A31adFc8D4CfBb4ec50E8B7#code)
- **VEK Token:** [etherscan.io/token/0xb4fa28e9dBA552dF8a55579Bc9494f0F7486d215](https://etherscan.io/token/0xb4fa28e9dBA552dF8a55579Bc9494f0F7486d215)
- **Gnosis Safe:** [app.safe.global/eth:0xBdCDb466c70E21A985E7eA02Be6E838aD5c00207](https://app.safe.global/home?safe=eth:0xBdCDb466c70E21A985E7eA02Be6E838aD5c00207)

---

## Contract Configuration

### Protocol Contract (`VektesProtocol`)

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

1. **Vektes Protocol** (`0xd055…8B7`) — for `send()`, `claim()`, `getTransfer()`, etc.
2. **The ERC-20 token being transferred** — `approve()` the protocol before sending.
3. **VEK Token** (`0xb4fa…d215`) — `approve()` the protocol to cover fees **only when fees are active** (they are currently 0). `previewFee()` returns the amount to budget.

```typescript
// Minimal setup
const VEKTES = "0xd0554A67EB0438a28A31adFc8D4CfBb4ec50E8B7";
const VEK    = "0xb4fa28e9dBA552dF8a55579Bc9494f0F7486d215";
const USDC   = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

// Approve the transfer token
const usdc = new ethers.Contract(USDC, ERC20_ABI, signer);
await usdc.approve(VEKTES, ethers.MaxUint256);

// Approve VEK for fees (only needed once fees are activated; a no-op while free)
const vek = new ethers.Contract(VEK, ERC20_ABI, signer);
await vek.approve(VEKTES, ethers.MaxUint256);
```

---

## Network Details

| Parameter | Value |
|-----------|-------|
| Chain | Ethereum Mainnet |
| Chain ID | 1 |
| Block Explorer | etherscan.io |

> **Note:** Vektes is currently deployed on Ethereum mainnet only. Multi-chain deployments are planned for future releases.
