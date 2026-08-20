# Vektes Protocol ($VEK) Token Distribution & Incentive Program

**Version:** 1.0 — Governance Proposal Draft  
**Date:** August 20, 2026  
**Status:** RFC (Request for Comments)  
**Author:** Vektes Core Team  

---

> ⚠️ **Draft for discussion — not active.** This is an RFC governance proposal. No program described here is live, funded, or committed; all figures, budgets, and parameters are proposals subject to change through governance. Legal and entity details (§5.1) are **pending counsel review and authoritative revision**. On-chain supply figures are approximate snapshots — see the live breakdown at [vektes.com/vesting](https://vektes.com/vesting).

## Executive Summary

Vektes is a payment settlement protocol on Ethereum mainnet enabling irrevocable transfers with deduplication codes and defined settlement dates. The $VEK token (1B fixed supply) serves as the protocol's fee token. With near-zero usage today and a true free float of only ~608K VEK (~0.06% of supply), this proposal outlines a comprehensive incentive program to bootstrap real protocol adoption while maintaining strict compliance guardrails.

**Core Principle:** Every token distributed must be earned through genuine protocol utility — never for purchasing, holding, or speculating on VEK. All incentives reward *usage of the protocol*, not *ownership of the token*.

---

## Token Context & Constraints

| Metric | Value |
|--------|-------|
| Total Supply | 1,000,000,000 VEK (fixed) |
| Undistributed (Gnosis Safe 2-of-3) | 739,900,000 VEK |
| True Free Float | ~608,000 VEK (~0.06%) |
| Community Allocation | 400,000,000 VEK |
| Treasury/DAO Allocation | 250,000,000 VEK |
| Liquidity Allocation | 90,000,000 VEK (remaining) |
| Fee Tiers | By monthly sender volume: free ≤$10K/mo, then 0.005% / 0.01% / 0.02% (**currently all 0 — fee-free launch**) |

> **Note on allocations:** the figures above reflect the **planned** distribution. On-chain today, undistributed tokens (including these program pools) sit in the treasury multisig, and a separate 250M is locked in insider vesting (UNCX, 1-yr cliff + 3-yr linear). Program budgets draw from the planned Community / Liquidity pools as those tokens are released. Live breakdown: [vektes.com/vesting](https://vektes.com/vesting).

**Legal Constraints:**
- US-based founder; LLC just filed
- No payments for buying/holding tokens
- All rewards tied to protocol usage or service provision
- Vesting and lockups on material distributions
- No yield/return promises on token holdings

---

## 1. Transaction Mining Program

### 1.1 Design Philosophy

Transaction mining rewards users who execute *real settlement transactions* through the Vektes protocol. Rewards are proportional to actual transfer volume processed, not token holdings. This is analogous to frequent-flyer miles — you earn by using the service, not by holding airline stock.

### 1.2 Reward Formula

```
Monthly Reward (user) = (User Settled Volume / Total Network Settled Volume) × Monthly Pool × Tier Multiplier × Time Bonus
```

**Where:**

| Component | Definition |
|-----------|-----------|
| User Settled Volume | Sum of all irrevocably settled transfers by this address in the epoch |
| Total Network Settled Volume | Sum of all settled transfers across all users in the epoch |
| Monthly Pool | Fixed VEK budget for that month (see emission schedule) |
| Tier Multiplier | 1.0x for Tier 1 (≤$100K), 0.8x for Tier 2 (≤$1M), 0.5x for Tier 3 (>$1M) |
| Time Bonus | 1.0x base; +0.1x for each consecutive month of activity (max 1.5x at month 6+) |

> The tier bands here follow the protocol's fee tiers, which are keyed to a sender's **rolling monthly settled volume** (not per-transaction size).

**Degressive Tier Multiplier Rationale:** Smaller users get proportionally more reward per dollar settled, incentivizing broad adoption over whale concentration. Large users still earn substantial absolute rewards but cannot dominate the pool.

### 1.3 Per-User Caps

| Cap Type | Limit | Rationale |
|----------|-------|-----------|
| Monthly per-address cap | 500,000 VEK | Prevents single entity from draining pool |
| Daily per-address cap | 25,000 VEK | Prevents burst gaming |
| Minimum transaction size | $100 | Filters dust/spam transactions |
| Maximum reward per transaction | 10,000 VEK | Caps individual tx gaming |

### 1.4 Anti-Gaming Measures

1. **Minimum Settlement Time:** Only transactions with settlement dates ≥ 24 hours from initiation qualify. Instant-settle transactions earn 0.5x multiplier. This prevents wash-trading loops.

2. **Cooldown Between Transactions:** Same sender→receiver pair limited to 1 qualifying transaction per 4-hour window. Burst patterns from same pair are flagged.

3. **Sybil Resistance:**
   - Addresses must have ≥ 3 unique counterparties per month to qualify for full rewards
   - Addresses with <3 counterparties receive 0.25x multiplier
   - Cluster analysis: if a group of addresses shows circular flow patterns (A→B→C→A), all flagged for manual review
   - New addresses (< 30 days on-chain history) receive 0.5x multiplier for first 60 days

4. **Deduplication Code Validation:** Each dedup code must be unique. Repeated use of similar structured codes from same sender triggers review.

5. **Volume Velocity Check:** If an address's monthly volume exceeds 10x its previous month with no organic growth pattern, rewards are escrowed pending review (14-day hold).

6. **Clawback Provision:** Gaming detected post-distribution triggers clawback from vesting remainder (see §5).

### 1.5 Budget & Phase Schedule

**Total Allocation:** 200,000,000 VEK (from 400M community pool)

| Phase | Months | Monthly Budget | Notes |
|-------|--------|---------------|-------|
| Phase 1: Bootstrap | 1–6 | 12,000,000 VEK/mo | High emissions to seed initial usage |
| Phase 2: Growth | 7–12 | 8,000,000 VEK/mo | Reduce as organic usage grows |
| Phase 3: Maturity | 13–18 | 5,000,000 VEK/mo | Further reduction |
| Phase 4: Sustain | 19–24 | 3,000,000 VEK/mo | Minimal ongoing incentive |
| **Total over 24 months** | | **168,000,000 VEK** | 32M reserved for extensions/adjustments |

**Vesting:** All transaction mining rewards vest linearly over 90 days from the end of each monthly epoch. Users can claim 1/3 immediately, 1/3 at day 30, 1/3 at day 90.

### 1.6 Epoch Mechanics

- **Epoch Length:** Monthly (calendar month, UTC)
- **Snapshot:** Continuous — all settled transactions counted in real-time
- **Calculation:** Off-chain aggregation published on-chain as Merkle root by day 5 of following month
- **Claim Window:** 90 days from publication (unclaimed tokens return to pool)
- **Dispute Period:** 7 days post-publication for challenges

---

## 2. Liquidity Incentive Program

### 2.1 Design Philosophy

Deep liquidity enables real commerce — merchants and users need confidence they can acquire VEK to pay fees and exit positions without excessive slippage. This program rewards *sustained* liquidity provision, not mercenary farming.

### 2.2 Target Pools

| Pool | Platform | Target TVL | Priority |
|------|----------|-----------|----------|
| VEK/USDT | Uniswap V3 | $500K–$2M | Primary |
| VEK/ETH | Uniswap V3 | $250K–$1M | Secondary |

### 2.3 Reward Structure

**Base Rewards:**
```
Weekly Reward (LP) = (LP's Time-Weighted Liquidity / Total Time-Weighted Liquidity) × Weekly Pool
```

**Concentrated Liquidity Bonus (Uniswap V3):**
- LPs providing liquidity within ±20% of current price: 1.5x multiplier
- LPs providing liquidity within ±50% of current price: 1.2x multiplier
- Wide range (full range): 1.0x base

**Lock Duration Bonuses:**

| Lock Period | Bonus Multiplier | Early Exit Penalty |
|-------------|-----------------|-------------------|
| No lock (flexible) | 1.0x | None |
| 30-day lock | 1.3x | Forfeit 50% of accrued rewards |
| 90-day lock | 1.6x | Forfeit 75% of accrued rewards |
| 180-day lock | 2.0x | Forfeit 100% of accrued rewards |

**Anti-Mercenary Design:**
- Lock bonuses make short-term farming unprofitable relative to longer commitments
- Early exit penalties redistribute forfeited rewards to remaining LPs
- Rewards calculated on *time-weighted* positions — adding liquidity for 1 hour before snapshot earns proportionally less

### 2.4 Budget & Phase Schedule

**Total Allocation:** 60,000,000 VEK (from 90M liquidity allocation; 30M reserved for future pools/CEX market-making)

| Phase | Months | Monthly Budget | Distribution |
|-------|--------|---------------|-------------|
| Phase 1: Seeding | 1–6 | 4,500,000 VEK/mo | 70% VEK/USDT, 30% VEK/ETH |
| Phase 2: Stabilization | 7–12 | 3,000,000 VEK/mo | 60% VEK/USDT, 40% VEK/ETH |
| Phase 3: Maintenance | 13–18 | 1,500,000 VEK/mo | 50/50 split |
| Phase 4: Wind-down | 19–24 | 750,000 VEK/mo | Governance decides allocation |
| **Total over 24 months** | | **58,500,000 VEK** | 1.5M reserved |

### 2.5 TVL Circuit Breakers

- If TVL exceeds $5M in any pool, emissions for that pool reduce by 50% (sufficient depth achieved)
- If TVL drops below $100K, emissions increase by 25% from reserve (emergency liquidity support)
- Governance can adjust targets quarterly

### 2.6 Vesting

- LP rewards accrue weekly
- 50% claimable immediately at week end
- 50% vests over 30 days
- Forfeited rewards from early exits are redistributed to active LPs in the following week

---

## 3. Developer Grants Program

### 3.1 Design Philosophy

Integrations drive protocol utility. Every new wallet, payment plugin, or ERP connector that supports Vektes creates a new on-ramp for transaction volume. Grants are paid for *delivered work*, not promises.

### 3.2 Grant Tiers

| Tier | Grant Size (VEK equivalent) | Target Projects | Examples |
|------|----------------------------|-----------------|----------|
| **Micro** | $5,000–$10,000 | Simple integrations, tools | Block explorer plugin, SDK wrapper, documentation |
| **Standard** | $10,000–$25,000 | Meaningful integrations | Wallet integration, payment button, invoice tool |
| **Major** | $25,000–$50,000 | Strategic integrations | ERP connector (SAP, NetSuite), merchant platform plugin, cross-chain bridge |
| **Flagship** | $50,000–$100,000 | Ecosystem-defining | Major payment processor integration, institutional custody support |

*VEK equivalent calculated at 30-day TWAP at time of milestone approval.*

### 3.3 Application Criteria

**Minimum Requirements:**
1. Open-source code (MIT or Apache 2.0 license)
2. Clear project scope and timeline (max 6 months per grant)
3. Demonstrated technical capability (GitHub history, prior work)
4. Defined milestones with deliverables
5. Commitment to 12-month maintenance post-delivery

**Scoring Matrix (100 points):**

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Protocol Impact | 30 | Expected increase in transaction volume |
| Technical Quality | 25 | Architecture, code quality, security |
| Team Capability | 20 | Track record, relevant experience |
| Ecosystem Fit | 15 | Fills a gap, non-duplicative |
| Maintenance Plan | 10 | Long-term viability |

**Threshold:** Projects scoring ≥ 60/100 are eligible. Above 80 qualifies for expedited review.

### 3.4 Milestone-Based Disbursement

All grants follow a milestone structure. No upfront payments.

| Milestone | Disbursement | Requirement |
|-----------|-------------|-------------|
| M0: Acceptance | 10% | Grant approved, scope finalized |
| M1: Prototype | 20% | Working proof-of-concept on testnet |
| M2: Testnet Complete | 30% | Full functionality on testnet, code audited |
| M3: Mainnet Launch | 25% | Deployed to mainnet, documentation complete |
| M4: Adoption | 15% | 90 days post-launch with demonstrated usage |

**Vesting:** Grant disbursements vest over 180 days from each milestone approval. 25% immediate, remainder linear.

### 3.5 Budget

**Total Allocation:** 50,000,000 VEK (from 400M community pool)

| Year | Budget | Target Grants |
|------|--------|--------------|
| Year 1 | 30,000,000 VEK | 15–25 grants across all tiers |
| Year 2 | 20,000,000 VEK | 10–15 grants (focus on Major/Flagship) |

### 3.6 Grant Committee

- 3-person committee (1 core team, 1 technical advisor, 1 community representative)
- Monthly review cycles (applications due by 15th, decisions by end of month)
- All decisions published with rationale
- Committee members recuse from projects they're involved in
- Transition to DAO governance vote once token distribution >5% of supply in community hands

---

## 4. Referral / Ambassador Program

### 4.1 Design Philosophy

Referrals reward users who bring *real transaction volume* to the protocol — not sign-ups, not wallet connections, not token purchases. A referral is only valuable if it results in settled transfers.

### 4.2 Mechanics

**Referral Link Generation:**
- Any address with ≥ 1 settled transaction can generate a referral code
- Referral code is embedded in the referred user's first transaction metadata
- Attribution persists for 12 months from first referred transaction

**Reward Structure:**
```
Monthly Referral Reward = Σ (Referred User Monthly Volume × Referral Rate) × Pool Availability Factor
```

| Referred User Monthly Volume | Referral Rate (paid to referrer) |
|-----------------------------|--------------------------------|
| $0–$50,000 | 0.001% of volume (in VEK) |
| $50,001–$500,000 | 0.0005% of volume (in VEK) |
| $500,001+ | 0.00025% of volume (in VEK) |

*Rates are degressive — referring a user who settles $1M/month earns the referrer ~$3.75/month in VEK, not enough to incentivize self-referral schemes but meaningful at scale.*

**Referred User Bonus:**
- Referred users receive a 10% boost to their own transaction mining rewards for the first 3 months
- This creates a positive-sum dynamic (both parties benefit from real usage)

### 4.3 Anti-Sybil Measures

1. **Volume Threshold:** Referrer only earns when a referred address settles ≥ $1,000 cumulative volume
2. **Unique Counterparty Requirement:** Referred address must transact with ≥ 2 unique counterparties (not including the referrer) within 60 days
3. **Self-Referral Detection:** If referrer and referred addresses show circular flows, both are disqualified
4. **Cap per Referrer:** Maximum 50 qualifying referrals per address per quarter (prevents industrial farming)
5. **Cap per Referrer Monthly Reward:** 200,000 VEK/month maximum

### 4.4 Ambassador Tier (High-Volume Referrers)

| Tier | Requirement | Bonus |
|------|-------------|-------|
| Bronze | 5+ active referrals generating $50K+ combined monthly volume | 1.2x referral rate |
| Silver | 15+ active referrals generating $250K+ combined monthly volume | 1.5x referral rate |
| Gold | 30+ active referrals generating $1M+ combined monthly volume | 2.0x referral rate + governance voice |

**"Active referral"** = referred address with ≥ $5,000 settled volume in the trailing 30 days.

### 4.5 Budget

**Total Allocation:** 30,000,000 VEK (from 400M community pool)

| Phase | Months | Monthly Cap |
|-------|--------|------------|
| Phase 1 | 1–12 | 1,500,000 VEK/mo |
| Phase 2 | 13–24 | 1,000,000 VEK/mo |
| **Total** | | **30,000,000 VEK** |

*Actual spend depends on referral-driven volume. Unspent monthly caps roll into following months (within phase).*

### 4.6 Vesting

- Referral rewards vest over 60 days (50% at claim, 50% at day 60)
- Ambassador tier bonuses vest over 90 days

---

## 5. Security, Legal & Governance Framework

### 5.1 Legal Considerations

**Securities Risk Mitigation:**

| Principle | Implementation |
|-----------|---------------|
| No investment returns | Rewards are earned through service/usage, never from holding |
| No pooling of funds | Users earn individually based on their own activity |
| No expectation of profit from others' efforts | All rewards tied to user's own transactions/contributions |
| Decentralization path | Progressive decentralization from multisig → DAO governance |
| Utility framing | VEK is a fee token required to use the protocol, not an investment vehicle |

**Specific Guardrails:**
1. **No staking rewards** for simply locking VEK (this implies passive returns on holdings)
2. **No buyback-and-burn** promises (implies price support)
3. **No references to "investment," "returns," or "appreciation"** in any program materials
4. **All rewards denominated in VEK, not USD** — participants earn tokens for services rendered to the network
5. **LP rewards are compensation for the service of providing liquidity** (market-making), not passive yield on token holdings
6. **Transaction mining is compensation for bootstrapping network effects** — analogous to early customer discounts

**Recommended Legal Steps (Pre-Launch):**
- [ ] Finalize LLC formation and operating agreement
- [ ] Reconcile the program's entity / governing-law choices with the published Terms of Service (currently Cayman Islands) before launch
- [ ] Engage crypto-specialized securities counsel (budget: $25K–$50K)
- [ ] Obtain formal legal opinion on each incentive program
- [ ] Consider Regulation D / Regulation S exemptions for any advisory token grants
- [ ] Implement KYC/sanctions screening for grants >$10K equivalent
- [ ] Establish terms of service with clear risk disclosures
- [ ] Consider DAO wrapper (e.g., Wyoming DAO LLC or Marshall Islands) for treasury governance

### 5.2 Vesting Summary

| Program | Immediate | Vesting Period | Cliff |
|---------|-----------|---------------|-------|
| Transaction Mining | 33% | 90 days linear | None |
| LP Rewards | 50% | 30 days linear | None |
| Developer Grants | 25% | 180 days linear | Per milestone |
| Referral Rewards | 50% | 60 days linear | None |
| Ambassador Bonuses | 0% | 90 days linear | 30 days |

### 5.3 Clawback Provisions

**Trigger Events:**
1. Confirmed gaming/wash trading (circular flows, Sybil clusters)
2. Material misrepresentation in grant applications
3. Failure to meet grant milestones without approved extension
4. Sanctions/compliance violations discovered post-distribution

**Clawback Mechanics:**
- Unvested tokens are automatically frozen upon trigger event
- 14-day dispute resolution period
- If confirmed: unvested tokens returned to program pool
- If disputed: 3-person arbitration panel (1 core team, 1 community, 1 neutral)
- Vested and claimed tokens cannot be clawed back (legal limitation)

**Penalty Tiers:**

| Severity | Action | Cooling Off |
|----------|--------|-------------|
| Minor (first offense, small amount) | Forfeit unvested from current epoch | 30-day exclusion |
| Moderate (pattern of gaming) | Forfeit all unvested across programs | 90-day exclusion |
| Severe (organized fraud) | Forfeit all unvested + permanent ban + public disclosure | Permanent |

### 5.4 Governance Path

**Phase 1 (Months 1–6): Multisig Governance**
- 2-of-3 Gnosis Safe controls all distributions
- Core team makes program decisions
- Community feedback via forum/Discord (advisory only)
- Monthly transparency reports published on-chain

**Phase 2 (Months 7–12): Advisory Governance**
- Expand multisig to 3-of-5 (add 2 community signers)
- Token-weighted signaling votes on parameter changes
- Grant committee includes community representative
- Quarterly program reviews with public comment period

**Phase 3 (Months 13–24): Progressive Decentralization**
- Deploy Governor contract (OpenZeppelin Governor or Compound-style)
- Token holders vote on emission rates, program parameters
- Core team retains emergency pause capability (time-locked, 48-hour delay)
- Target: full DAO control by month 24

**Modification Authority:**

| Parameter | Who Can Change | Process |
|-----------|---------------|---------|
| Monthly emission caps | Multisig (Phase 1–2), DAO (Phase 3) | 7-day timelock |
| Anti-gaming thresholds | Core team (all phases) | Immediate (security) |
| New program creation | Multisig (Phase 1–2), DAO (Phase 3) | 14-day vote + 7-day timelock |
| Emergency pause | Core team (all phases) | Immediate, 48-hour auto-resume |
| Program termination | Multisig unanimity (Phase 1–2), DAO supermajority (Phase 3) | 30-day wind-down |

### 5.5 Operational Security

- All Merkle roots for reward distributions verified by 2+ independent off-chain aggregators
- Smart contract upgrades via transparent proxy with 7-day timelock
- Bug bounty program: up to 500,000 VEK for critical vulnerabilities in distribution contracts
- Monthly third-party audit of distribution calculations (publish methodology)

---

## 6. Emission Schedule

### 6.1 Total Program Allocations

| Program | Allocation (VEK) | Source Pool | % of Total Supply |
|---------|-------------------|-------------|-------------------|
| Transaction Mining | 200,000,000 | Community (400M) | 20.0% |
| Liquidity Incentives | 60,000,000 | Liquidity (90M) | 6.0% |
| Developer Grants | 50,000,000 | Community (400M) | 5.0% |
| Referral / Ambassador | 30,000,000 | Community (400M) | 3.0% |
| **Total Incentive Programs** | **340,000,000** | | **34.0%** |

**Remaining Reserves:**
- Community pool: 120,000,000 VEK (future programs, governance-directed)
- Liquidity pool: 30,000,000 VEK (future pools, CEX listings)
- Treasury/DAO: 250,000,000 VEK (ops, partnerships, contingency)

### 6.2 Year 1 Monthly Emission Schedule

| Month | Tx Mining | LP Rewards | Dev Grants | Referral | **Monthly Total** | Cumulative |
|-------|-----------|-----------|-----------|----------|-------------------|-----------|
| 1 | 12,000,000 | 4,500,000 | 2,500,000 | 1,500,000 | **20,500,000** | 20,500,000 |
| 2 | 12,000,000 | 4,500,000 | 2,500,000 | 1,500,000 | **20,500,000** | 41,000,000 |
| 3 | 12,000,000 | 4,500,000 | 2,500,000 | 1,500,000 | **20,500,000** | 61,500,000 |
| 4 | 12,000,000 | 4,500,000 | 2,500,000 | 1,500,000 | **20,500,000** | 82,000,000 |
| 5 | 12,000,000 | 4,500,000 | 2,500,000 | 1,500,000 | **20,500,000** | 102,500,000 |
| 6 | 12,000,000 | 4,500,000 | 2,500,000 | 1,500,000 | **20,500,000** | 123,000,000 |
| 7 | 8,000,000 | 3,000,000 | 2,500,000 | 1,500,000 | **15,000,000** | 138,000,000 |
| 8 | 8,000,000 | 3,000,000 | 2,500,000 | 1,500,000 | **15,000,000** | 153,000,000 |
| 9 | 8,000,000 | 3,000,000 | 2,500,000 | 1,500,000 | **15,000,000** | 168,000,000 |
| 10 | 8,000,000 | 3,000,000 | 2,500,000 | 1,500,000 | **15,000,000** | 183,000,000 |
| 11 | 8,000,000 | 3,000,000 | 2,500,000 | 1,500,000 | **15,000,000** | 198,000,000 |
| 12 | 8,000,000 | 3,000,000 | 2,500,000 | 1,500,000 | **15,000,000** | 213,000,000 |
| **Year 1 Total** | **120,000,000** | **45,000,000** | **30,000,000** | **18,000,000** | **213,000,000** | |

### 6.3 Year 2 Quarterly Summary

| Quarter | Tx Mining | LP Rewards | Dev Grants | Referral | Quarterly Total |
|---------|-----------|-----------|-----------|----------|-----------------|
| Q1 (M13–15) | 15,000,000 | 4,500,000 | 5,000,000 | 3,000,000 | 27,500,000 |
| Q2 (M16–18) | 15,000,000 | 4,500,000 | 5,000,000 | 3,000,000 | 27,500,000 |
| Q3 (M19–21) | 9,000,000 | 2,250,000 | 5,000,000 | 3,000,000 | 19,250,000 |
| Q4 (M22–24) | 9,000,000 | 2,250,000 | 5,000,000 | 3,000,000 | 19,250,000 |
| **Year 2 Total** | **48,000,000** | **13,500,000** | **20,000,000** | **12,000,000** | **93,500,000** |

### 6.4 Cumulative Distribution (24 Months)

| Program | Year 1 | Year 2 | 24-Month Total | % of Allocation Used |
|---------|--------|--------|----------------|---------------------|
| Transaction Mining | 120,000,000 | 48,000,000 | 168,000,000 | 84% of 200M |
| LP Rewards | 45,000,000 | 13,500,000 | 58,500,000 | 97.5% of 60M |
| Developer Grants | 30,000,000 | 20,000,000 | 50,000,000 | 100% of 50M |
| Referral | 18,000,000 | 12,000,000 | 30,000,000 | 100% of 30M |
| **Total** | **213,000,000** | **93,500,000** | **306,500,000** | 90.1% of 340M |

**Remaining after 24 months:** 33,500,000 VEK in program reserves for extensions or new programs.

### 6.5 Emission Decline Visualization

```
Monthly Emissions (VEK, millions)
     
 20M |████████████
     |████████████
 15M |████████████ ██████████████████
     |████████████ ██████████████████
 10M |████████████ ██████████████████ ████████████
     |████████████ ██████████████████ ████████████
  5M |████████████ ██████████████████ ████████████ ████████████
     |████████████ ██████████████████ ████████████ ████████████
     +------------------------------------------------------------
      M1-6 (20.5M)  M7-12 (15M)    M13-18 (9.2M)  M19-24 (6.4M)
```

### 6.6 Float Impact Analysis

| Timeframe | Max New Float (if all claimed) | New Float as % of Supply | Cumulative Float |
|-----------|-------------------------------|--------------------------|-----------------|
| Month 1 | 20,500,000 | 2.05% | ~21.2M (2.12%) |
| Month 6 | 20,500,000 | 2.05% | ~124M (12.4%) |
| Month 12 | 15,000,000 | 1.50% | ~214M (21.4%) |
| Month 24 | 6,417,000 | 0.64% | ~307M (30.7%) |

*Note: Actual float will be lower due to vesting schedules, unclaimed rewards, and lock bonuses. Estimated realized float: 60–70% of distributed tokens at any given time.*

---

## 7. KPIs & Success Metrics

### 7.1 Primary KPIs

| Metric | Month 3 Target | Month 6 Target | Month 12 Target | Month 24 Target |
|--------|---------------|---------------|----------------|----------------|
| Monthly Settled Volume | $1M | $10M | $50M | $250M |
| Monthly Active Addresses | 50 | 200 | 1,000 | 5,000 |
| Unique Counterparty Pairs | 100 | 500 | 2,500 | 15,000 |
| Protocol Fee Revenue (VEK) | 5,000 | 50,000 | 500,000 | 2,500,000 |
| Average Transaction Size | $5,000 | $10,000 | $15,000 | $20,000 |

### 7.2 Program-Specific KPIs

**Transaction Mining:**

| Metric | Target (Month 12) | Failure Threshold |
|--------|-------------------|-------------------|
| % of volume from organic (non-incentivized) repeat users | >30% | <10% |
| User retention (active 3+ consecutive months) | >40% | <15% |
| Median transactions per active user per month | 5+ | <2 |
| Sybil/gaming detection rate | <5% of claims flagged | >20% flagged |

**Liquidity:**

| Metric | Target (Month 12) | Failure Threshold |
|--------|-------------------|-------------------|
| VEK/USDT TVL | >$1M | <$200K |
| VEK/ETH TVL | >$500K | <$100K |
| Average LP lock duration | >60 days | <14 days |
| Slippage for $10K swap | <2% | >10% |
| Number of unique LPs | >50 | <10 |

**Developer Grants:**

| Metric | Target (Month 12) | Failure Threshold |
|--------|-------------------|-------------------|
| Grants approved | 15+ | <5 |
| Grants reaching M3 (mainnet) | >70% | <40% |
| Integrations driving measurable volume | >50% of launched | <20% |
| Developer satisfaction (survey) | >4/5 | <3/5 |

**Referral Program:**

| Metric | Target (Month 12) | Failure Threshold |
|--------|-------------------|-------------------|
| Active referrers | 100+ | <20 |
| % of new users via referral | >30% | <10% |
| Referred user 90-day retention | >50% | <20% |
| Cost per acquired active user (in VEK) | <50,000 VEK | >200,000 VEK |

### 7.3 Health Metrics (Circuit Breakers)

These metrics trigger program review or pause if breached:

| Red Flag | Threshold | Action |
|----------|-----------|--------|
| Single address earning >10% of monthly pool | Automatic | Cap enforcement + review |
| >30% of volume between <10 address pairs | Investigation | 14-day pause if confirmed gaming |
| LP TVL drops >50% in 7 days | Alert | Emergency emission increase from reserve |
| >50% of grants failing milestones | Quarterly review | Committee restructure, criteria revision |
| Protocol fee revenue declining 3 months straight despite rising incentives | Quarterly review | Program restructure or pause |
| Token price correlation >0.9 with emission events | Monitoring | Legal counsel review |

### 7.4 Reporting & Transparency

**Monthly Reports (Published On-Chain + Forum):**
- Total VEK distributed per program
- Number of unique recipients
- Top 10 recipients (addresses, no doxxing)
- Gaming attempts detected and resolved
- Protocol volume and fee metrics
- Float analysis and vesting status

**Quarterly Reviews:**
- Program effectiveness assessment against KPIs
- Parameter adjustment proposals (if needed)
- Community feedback summary
- Legal/compliance status update
- Budget utilization vs. plan

### 7.5 Continuation Criteria

Programs continue if **all** of the following hold:
1. At least 2 of 4 primary KPIs are on track for their targets
2. No failure thresholds breached for 2+ consecutive months
3. Cost per active user trending down (improving efficiency)
4. Protocol fee revenue growing month-over-month (real adoption signal)

**Program Sunset Triggers:**
- Protocol achieves self-sustaining volume (fees cover operational costs without incentives)
- 24-month allocation fully distributed
- DAO governance votes to terminate/redirect remaining allocation
- Legal/regulatory change requiring program modification

---

## Appendix A: Implementation Checklist

### Pre-Launch (Weeks 1–4)
- [ ] Legal opinion on all four programs
- [ ] Smart contract development (MerkleDistributor, vesting, LP gauge)
- [ ] Smart contract audit (minimum 2 independent auditors)
- [ ] Testnet deployment and testing
- [ ] Anti-gaming detection system (off-chain monitoring)
- [ ] Dashboard development (public transparency)
- [ ] Terms of Service drafted and published
- [ ] Community announcement and feedback period (14 days)

### Launch (Week 5)
- [ ] Deploy distribution contracts to mainnet
- [ ] Seed initial LP positions (protocol-owned liquidity)
- [ ] Open transaction mining epoch 1
- [ ] Publish grant application form
- [ ] Launch referral code generation
- [ ] Begin weekly monitoring reports

### Ongoing (Monthly)
- [ ] Epoch close and Merkle root publication
- [ ] Gaming review and clawback processing
- [ ] Grant milestone reviews
- [ ] KPI tracking and reporting
- [ ] Community governance calls

---

## Appendix B: Comparative Analysis

| Protocol | Mechanism | Daily Emission | Result |
|----------|-----------|---------------|--------|
| dYdX | Trading rewards (volume-based) | ~3.8M DYDX/epoch | Successfully bootstrapped volume; some wash trading |
| Blur | Listing + bidding rewards | Points-based | Dominated NFT market; high mercenary activity |
| Optimism | RetroPGF + ecosystem grants | Grant-based | Strong ecosystem growth; slower distribution |
| **Vektes (proposed)** | **Settlement mining + LP + grants** | **~683K VEK/day (Y1 avg)** | **Target: organic adoption by M12** |

**Key Differentiator:** Vektes rewards *settled* transactions (irrevocable), not trades. The settlement time requirement (≥24 hours for full rewards) and counterparty diversity requirement make gaming significantly more expensive than on trading platforms.

---

## Appendix C: Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Sybil farming dominates rewards | Medium | High | Counterparty requirements, velocity checks, manual review |
| Mercenary LPs dump on vest | Medium | Medium | Lock bonuses, gradual vesting, exit penalties |
| Low organic adoption despite incentives | Medium | High | Monthly KPI review, program pivots, sunset triggers |
| Regulatory action (securities claim) | Low | Critical | Legal opinion pre-launch, usage-only framing, no yield language |
| Smart contract exploit | Low | Critical | Multiple audits, bug bounty, timelocked upgrades, insurance |
| Token price collapse discourages participation | Medium | Medium | VEK-denominated targets, not USD; adjust grant sizes at TWAP |
| Grant recipients fail to deliver | Medium | Low | Milestone-based disbursement, clawback on non-delivery |

---

*This document is a governance proposal draft. It does not constitute legal advice, financial advice, or a promise of returns. All programs are subject to modification through the governance process described in Section 5.4. Participation in any program requires acceptance of the Vektes Protocol Terms of Service.*

---

**Document Hash:** [To be computed on finalization]  
**Governance Forum:** [To be linked]  
**Discussion Period:** 14 days from publication  
**Vote (if applicable):** Snapshot signal vote → on-chain execution
