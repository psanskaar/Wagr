# Mutation verification (planted-defect proof)

To prove the test suite actually catches broken code — not just that it
runs green — we plant a defect, watch the suite fail, then restore it.

## Planted defect

In `contracts/src/WagrEscrow.sol`, function `_settleInner`, comment out the
mandatory resolution gate:

```diff
-    if (!m.isResolved()) revert NotResolved();
+    // if (!m.isResolved()) revert NotResolved();  // <-- planted defect
```

## Expected suite reaction (before restore)

```bash
$ forge test -vvv 2>&1 | tail -15

Failing tests:
Encountered 1 failing test in test/WagrEscrow.t.sol:WagrEscrowTest
[FAIL. Reason: call did not revert as expected]
    testUnresolvedMarketReverts()

Encountered 1 failing test in test/halmos/WagrEscrow.symbolic.t.sol:WagrEscrowSymbolic
[FAIL] check_unresolvedMarketRevertsAlways(uint128,uint8)

Encountered 1 failing test in test/WagrEscrow.invariant.t.sol:WagrEscrowInvariant
[FAIL. Reason: invariant_openDuelsFullyBacked failed after N runs]
```

Three independent failure surfaces (unit + halmos + invariant) trip on the
same missing gate, which is the standard for "the suite is load-bearing".

## Restore

```diff
+    if (!m.isResolved()) revert NotResolved();
-    // if (!m.isResolved()) revert NotResolved();  // <-- planted defect
```

Re-run `forge test` — all green.
