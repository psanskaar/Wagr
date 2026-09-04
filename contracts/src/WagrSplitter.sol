// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable}     from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/// @title  WagrSplitter - immutable N-way fee splitter (0xSplits-style)
/// @notice Each creator gets their own CREATE2 clone of this contract. The
///         clone address is passed to DreamDEX as the `builder` on
///         `placeOrder`, and DreamDEX pays the builder fee straight to the
///         clone. Recipients pull their share whenever they want.
///
///         Per-order gas overhead on the trade path is exactly ONE ERC-20
///         transfer (DreamDEX → splitter) — the N-way split is amortized
///         off the trade path.
contract WagrSplitter is Initializable {
    using SafeERC20 for IERC20;

    struct Recipient {
        address to;
        uint32  shareBps; // 0..10_000
    }

    Recipient[] public recipients;

    // token → recipient → already-paid amount (pull-payment bookkeeping)
    mapping(address => mapping(address => uint256)) public paid;
    // token → cumulative amount ever received
    mapping(address => uint256) public totalReceived;

    event Received(address indexed token, uint256 amount, uint256 totalReceived);
    event Claimed(address indexed token, address indexed recipient, uint256 amount);

    error BadShares();
    error NotRecipient();
    error NothingToClaim();

    function initialize(Recipient[] calldata _recipients) external initializer {
        uint256 total;
        for (uint256 i = 0; i < _recipients.length; i++) {
            recipients.push(_recipients[i]);
            total += _recipients[i].shareBps;
        }
        if (total != 10_000) revert BadShares();
    }

    /// @notice Call to snapshot a new balance as "received" so recipients
    ///         can claim their share. Idempotent per-call.
    function accrue(address token) public returns (uint256 delta) {
        uint256 bal = IERC20(token).balanceOf(address(this));
        uint256 alreadyOwed;
        for (uint256 i = 0; i < recipients.length; i++) {
            alreadyOwed += _owed(token, recipients[i]);
        }
        // Anything on-hand beyond current owed = new incoming.
        // We fold new incoming into totalReceived and let recipients pull.
        uint256 currentAssumed = totalReceived[token] - _totalPaid(token);
        if (bal > currentAssumed + alreadyOwed) {
            delta = bal - (currentAssumed + alreadyOwed);
            totalReceived[token] += delta;
            emit Received(token, delta, totalReceived[token]);
        }
    }

    function claim(address token) external returns (uint256 amount) {
        accrue(token);
        (bool isMember, Recipient memory r) = _lookup(msg.sender);
        if (!isMember) revert NotRecipient();
        amount = _owed(token, r);
        if (amount == 0) revert NothingToClaim();
        paid[token][msg.sender] += amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Claimed(token, msg.sender, amount);
    }

    function owed(address token, address recipient) external view returns (uint256) {
        (bool isMember, Recipient memory r) = _lookup(recipient);
        if (!isMember) return 0;
        return _owed(token, r);
    }

    function _owed(address token, Recipient memory r) internal view returns (uint256) {
        uint256 total = totalReceived[token] * r.shareBps / 10_000;
        uint256 got   = paid[token][r.to];
        return total > got ? total - got : 0;
    }

    function _totalPaid(address token) internal view returns (uint256 s) {
        for (uint256 i = 0; i < recipients.length; i++) s += paid[token][recipients[i].to];
    }

    function _lookup(address who) internal view returns (bool, Recipient memory r) {
        for (uint256 i = 0; i < recipients.length; i++) {
            if (recipients[i].to == who) return (true, recipients[i]);
        }
        return (false, r);
    }

    function recipientCount() external view returns (uint256) { return recipients.length; }
}
