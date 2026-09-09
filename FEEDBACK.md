# Developer Feedback: Building on Somnia Shannon Testnet

**Project**: Wagr (Peer-to-Peer Prediction Duels & Squad Tournaments)  
**Live App**: [https://wagr-app.vercel.app](https://wagr-app.vercel.app)  
**Network**: Somnia Shannon Testnet (Chain ID: `50312`)  
**Contracts Deployed**:
- `WagrEscrow`: [`0xc160f68e5f2e6846057ad6d4ada5d320b385c2cb`](https://shannon-explorer.somnia.network/address/0xc160f68e5f2e6846057ad6d4ada5d320b385c2cb)
- `WagrSeason`: [`0x890506b7288573412674d8e8f34622aeb57fa708`](https://shannon-explorer.somnia.network/address/0x890506b7288573412674d8e8f34622aeb57fa708)
- `WagrSplitterFactory`: [`0x1190048fb57e44fdedb418696075e884a9d89308`](https://shannon-explorer.somnia.network/address/0x1190048fb57e44fdedb418696075e884a9d89308)

---

## 1. Executive Summary

Building **Wagr** on Somnia Shannon testnet allowed us to test high-frequency, event-driven smart contract architecture at a scale that is cost-prohibitive or technically impossible on standard EVM rollups. 

Wagr leverages Somnia's native Reactivity Precompile (`0x0000000000000000000000000000000000000100`) to create zero-click, automated payouts when DreamDEX binary prediction markets resolve. Below is an honest, detailed breakdown of our developer experience, including what worked seamlessly, the friction points and bugs we encountered, and constructive suggestions for the Somnia ecosystem team.

---

## 2. What Worked Exceptionally Well

### Sub-Second Execution & Near-Instant Finality
- The block times on Somnia Shannon (~100ms to 200ms) made peer-to-peer wager creation, acceptance, and commit-reveal flows feel like Web2 consumer gaming.
- Confirmation delays were virtually imperceptible, which is a massive upgrade over conventional L2s for interactive prediction products.

### Native Reactivity Precompile (`0x...0100`)
- The precompile architecture fundamentally solves the biggest UX bottleneck in Web3 prediction markets: **manual claim vouchers and gas-paid withdrawals**.
- By subscribing to DreamDEX's `Resolved(bytes32,uint8,uint256[])` event, `WagrEscrow` can automatically push payouts directly to the winner's wallet inside the exact block where the oracle resolves.
- This eliminated the need for external, fragile keeper infrastructure (e.g. Gelato or custom bots) for core 1v1 duel settlement.

### EVM Tooling Compatibility
- Foundry (`forge`, `cast`, `anvil`) worked out of the box with Somnia Shannon testnet RPC endpoints.
- Integration with modern frontend libraries (`viem@2.x`, `wagmi@2.x`, `RainbowKit`) was straightforward by defining custom chain parameters (`id: 50312`).
- OpenZeppelin contracts (`SafeERC20`, `MerkleProof`, `BitMaps`, `ReentrancyGuard`) compiled and executed with 100% bytecode fidelity on Solidity `^0.8.26`.

---

## 3. Challenges & Bugs Encountered

### 1. RPC 1,000-Block Log Query Limit (`eth_getLogs`)
- **The Issue**: When querying historical contract events via standard Viem/Ethers methods (`publicClient.getContractEvents` with `fromBlock: 0n` or wide ranges), the Somnia Shannon RPC returned an error stating that log requests cannot exceed 1,000 blocks.
- **Impact on Dev**: On an ultra-fast chain producing multiple blocks per second, 1,000 blocks represent only a few minutes of real-world history. Querying tournament entrants or historic duel activity quickly broke on page reloads.
- **Our Solution**: We bypassed the RPC log filter by querying the Shannon Blockscout Explorer REST API directly (`/api?module=logs&action=getLogs`) which indexes contract events without the 1,000-block ceiling.
- **Recommendation for Somnia**: 
  - Provide clear documentation highlighting the 1,000-block log cap.
  - Consider offering a dedicated indexed log service or relaxing the block range for specific contract address filters.

### 2. Local Testing and Mocking for Reactivity Precompile
- **The Issue**: Foundry's local test environment does not natively include Somnia's custom precompile at address `0x0000000000000000000000000000000000000100`. Running local unit tests without mocks causes calls to revert or fail silent simulation.
- **Our Solution**: In our Foundry test suite (`contracts/test/WagrEscrow.t.sol`), we used `vm.prank(0x0000000000000000000000000000000000000100)` to simulate validator-triggered reactivity. In production, we also deployed a backup relayer endpoint (`/api/settle`) to guarantee settlements in edge cases.
- **Recommendation for Somnia**:
  - Release a lightweight `somnia-foundry` cheatcode package or a pre-configured Dockerized node image that includes the reactivity precompile for local integration testing.

### 3. Blockscout Explorer Indexing Latency vs Live RPC State
- **The Issue**: On Shannon testnet, transactions confirm on the RPC in roughly 200ms. However, the Blockscout explorer REST API often took between 3 to 10 seconds to index the resulting event logs.
- **Impact on Dev**: If a user deposited an ante to join a tournament and the page immediately re-queried Blockscout, the user would not yet appear in the entrant list, making it look as though their ante was lost.
- **Our Solution**: Implemented an optimistic local state merge: the UI immediately displays the user's on-chain participation if `WagrSeason.entered(seasonId, userAddress)` returns `true` via direct RPC read, even if the explorer log has not yet indexed.
- **Recommendation for Somnia**:
  - Improve the synchronization speed of the Shannon explorer indexer to match the speed of the underlying consensus layer.

---

## 4. Developer Experience & Tooling Suggestions

1. **TypeScript Reactivity SDK**:
   - A standardized npm package (e.g. `@somnia/reactivity-sdk`) providing React hooks, subscription handlers, and typed ABI definitions for `ISomniaEventHandler` would drastically reduce onboarding friction for new developers.

2. **Multi-Token Faucet Integration**:
   - The STT and USDso faucets were dependable. An integrated multi-asset faucet interface where developers can request both gas tokens (STT) and test collateral (USDso) in a single action would speed up new environment setups.

3. **Reactivity Debugger in Explorer**:
   - Adding a dedicated "Reactivity Dispatch" badge on the Shannon Blockscout Explorer (identifying transactions triggered by the `0x...0100` precompile) would give developers immediate visual feedback when testing event-driven contracts.

---

## 5. Conclusion

Building Wagr on Somnia Shannon demonstrated the genuine potential of sub-second block execution and native event reactivity. The ability to eliminate claim buttons and automate financial settlements in the same block as oracle resolution represents a major leap forward for Web3 UX. We look forward to seeing Somnia's mainnet rollout and continuing to expand Wagr's social wagering layer on this infrastructure.
