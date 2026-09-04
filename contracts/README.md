# Wagr contracts

Foundry project. Solidity 0.8.26.

## Install

```bash
forge install foundry-rs/forge-std openzeppelin/openzeppelin-contracts@v5.0.2
forge build
forge test -vvv
```

## The five contracts

| Contract | Role |
|---|---|
| `WagrEscrow.sol` | Core P2P duel escrow. Simple flow + commit-reveal maker queue. Implements `ISomniaEventHandler` for zero-click reactivity auto-settlement. |
| `WagrSeason.sol` | Season leaderboard payouts via a Merkle root + `BitMaps` claim tracker. Constant per-claim gas regardless of season size. |
| `WagrSplitter.sol` | Immutable N-way ERC-20 fee splitter, one per creator. Amortises multi-recipient split off the trade path. |
| `WagrSplitterFactory.sol` | CREATE2 deployer for splitter clones. |
| `interfaces/*` | Wire-thin ABIs for `IBinaryMarket`, `ISomniaEventHandler`, `IApproveBuilder`. |

## The five view calls we depend on

Every settlement decision is made from these five reads on the DreamDEX
`BinaryMarket` clone contract:

| SDK equivalent | On-chain call | Purpose |
|---|---|---|
| `getMarketOnchain(marketId).isResolved` | `IBinaryMarket.isResolved()` | Mandatory gate before reading the winner. |
| `getMarketOnchain(marketId).isVoided`   | `IBinaryMarket.isVoided()`   | If true, refund both sides. |
| `getMarketOnchain(marketId).winningOutcome` | `IBinaryMarket.winningOutcome()` | 0 = YES, 1 = NO. |
| `getMarketOnchain(marketId).expiry`     | `IBinaryMarket.expiry()`     | Block createDuel/acceptDuel once the market has locked. |
| `getMarketOnchain(marketId).collateral` | `IBinaryMarket.collateral()` | Sanity-check collateral matches escrow. |

MarketOnchain interface reference:
https://prd.smk.somnia.host/docs/typescript/api/index/interfaces/MarketOnchain
