# Wagr

> Peer-to-peer prediction duels on DreamDEX event contracts with zero-click automated payouts powered by Somnia Reactivity.

Wagr turns any DreamDEX binary market into a shareable 1v1 wager. When the oracle resolves the market, payouts are routed directly to the winner's wallet in the same block: zero claim vouchers, zero manual withdrawals, and zero user friction.

**Live Application**: [https://wagr-app.vercel.app](https://wagr-app.vercel.app)  
**Live Duel Room**: [https://wagr-app.vercel.app/duel/3](https://wagr-app.vercel.app/duel/3)

---

## Overview

DreamDEX provides on-chain event contract CLOBs on Somnia Shannon testnet. While central limit order books work for market makers, retail users and communities prefer direct head-to-head competition. Wagr acts as the distribution and social wagering layer on top of DreamDEX:

1. **1v1 Peer Duels**: Challenge any opponent via a shareable duel link tied to live DreamDEX market windows (1m, 5m, 15m, 1h, 4h, 24h).
2. **Zero-Click Automated Settlement**: When DreamDEX emits `Resolved`, Somnia's native reactivity precompile triggers `WagrEscrow.onEvent(...)` to settle the duel and push collateral straight to the winner. A permissionless relayer acts as a live fallback.
3. **Anti-MEV Commit-Reveal Wagers**: Players can stake in a sealed wager queue using cryptographic commitments (`keccak256(side, salt)`) to eliminate front-running and copy-trading.
4. **Creator Fee Splitters**: Streamers and creators deploy immutable CREATE2 splitters via `WagrSplitterFactory.sol`. Wagers placed through their custom embed widgets route DreamDEX builder fees (`approveBuilder`) directly to their splitter.
5. **Squad Seasons**: Tournament rooms with atomic multi-winner payouts verified on-chain through Merkle roots in `WagrSeason.sol`.

---

## Zero-Click Settlement Architecture

Traditional prediction markets force winners to return to the site, sign a claim transaction, and pay gas to retrieve winnings. 

Wagr settles duels automatically using Somnia's execution model:
- **Somnia Reactivity Transport**: `WagrEscrow` implements `ISomniaEventHandler`. Upon market resolution, Somnia validators call `onEvent(...)` from precompile `0x0000000000000000000000000000000000000100`.
- **Direct Push Payout**: Settlement calls `collateral.safeTransfer(winner, payout)` within the resolution transaction.
- **Relayer Fallback**: The Next.js backend endpoint `/api/settle` monitors resolution state and provides redundant settlement triggers so users never have to manually claim.

---

## Contracts (Somnia Shannon Testnet)

Network: **Somnia Shannon Testnet** (Chain ID: `50312`)  
RPC: `https://api.infra.testnet.somnia.network`

| Contract | Address | Purpose |
|---|---|---|
| **WagrEscrow** | [`0xc160f68e5f2e6846057ad6d4ada5d320b385c2cb`](https://shannon-explorer.somnia.network/address/0xc160f68e5f2e6846057ad6d4ada5d320b385c2cb) | P2P Duel Escrow, Commit-Reveal Queue, Reactivity Handler |
| **WagrSeason** | [`0x890506b7288573412674d8e8f34622aeb57fa708`](https://shannon-explorer.somnia.network/address/0x890506b7288573412674d8e8f34622aeb57fa708) | Squad Tournaments, Merkle Payouts, BitMap Claim Tracker |
| **WagrSplitterFactory** | [`0x1190048fb57e44fdedb418696075e884a9d89308`](https://shannon-explorer.somnia.network/address/0x1190048fb57e44fdedb418696075e884a9d89308) | CREATE2 Immutable Creator Fee Splitter Clones |
| **USDso (Collateral)** | [`0x70a86d8842fb63c4ad2b7cdddf530ebf1bb25d8e`](https://shannon-explorer.somnia.network/address/0x70a86d8842fb63c4ad2b7cdddf530ebf1bb25d8e) | DreamDEX Collateral (6 Decimals) |
| **Reactivity Precompile** | `0x0000000000000000000000000000000000000100` | Somnia Native Event Dispatcher |

*Verified On-Chain Proof Tx: [`0xb8290da3b70add14e567b43fb75bcfd56951e69110a0e5cd631fae83f8858f33`](https://shannon-explorer.somnia.network/tx/0xb8290da3b70add14e567b43fb75bcfd56951e69110a0e5cd631fae83f8858f33) (Block #477711153)*

---

## Verification and Testing Receipts

Full test suite with unit tests, stateful invariant fuzzing, and formal Halmos symbolic proofs. See [`verify/mutation.md`](./verify/mutation.md) for planted-defect testing.

| Test Suite | Method | Verified Results |
|---|---|---|
| **Unit Tests** | `forge test -vvv` | 24 passing unit tests covering WagrEscrow (19), WagrSeason (3), WagrSplitter (2) |
| **Invariant Campaigns** | Stateful Fuzzing | 2 campaigns (4,096 calls each; 128 runs at depth 32) verifying total escrow solvency |
| **Total Test Suite** | `forge test` | 26 passed, 0 failed, 0 skipped across 5 suites |
| **Halmos Symbolic** | `halmos` | 4 formal properties proving zero overpay, unresolved revert, void refund, and idempotency |
| **Code Coverage** | `forge coverage` | 100% source code coverage across core escrow functions |
| **Static Analysis** | Slither & CodeQL | Configured in CI with zero high or medium findings |

---

## Local Setup & Testing

### 1. Smart Contracts
Install dependencies and run the test suite:
```bash
cd contracts
forge install foundry-rs/forge-std openzeppelin/openzeppelin-contracts@v5.0.2 --no-commit
forge test -vvv
```

### 2. Frontend Application
```bash
pnpm install
cp web/.env.example web/.env.local
pnpm --filter web dev
```

---

## Repository Structure

```
wagr/
├── contracts/          Foundry contracts, unit tests, symbolic proofs, invariants
│   ├── src/            WagrEscrow.sol, WagrSeason.sol, WagrSplitter.sol, WagrSplitterFactory.sol
│   ├── script/         Deploy.s.sol, SeedDemo.s.sol
│   └── test/           Unit tests, Halmos symbolic proofs, invariant campaigns
├── keeper/             Reactivity subscriber service and fallback polling keeper
├── web/                Next.js 14 frontend (Tailwind CSS, RainbowKit, Wagmi, Viem)
│   ├── app/            Duel arena, catalog, dashboard, creator studio, widget embed
│   ├── components/     Victory/defeat modal, live countdowns, reactive telemetry
│   └── lib/            Contract ABIs, address mappings, DreamDEX GraphQL queries
├── verify/             Static analysis, mutation testing docs, SDK differential ABI checks
├── deploy/             Deployment receipts and address configurations
└── README.md
```

---

*Built for the Somnia x DreamDEX Event Contracts Hackathon.*
