// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISoleFunRound {
    function currentRoundId() external view returns (uint256);

    function finalizeRound(uint256 roundId) external;
}

/// @title SoleFunKeeper
/// @notice A small permissioned trigger that finalizes ended SoleFun rounds.
/// @dev This contract cannot wake itself up. An authorized keeper wallet or
/// automation service must call performUpkeep after the round has ended.
contract SoleFunKeeper {
    ISoleFunRound public immutable roundContract;
    bytes4 private constant GET_ROUND_SELECTOR = bytes4(keccak256("getRound(uint256)"));
    address public owner;
    address public keeper;
    bool public paused;

    error ZeroAddress();
    error NotOwner();
    error NotKeeper();
    error Paused();
    error RoundNotReady();

    event KeeperUpdated(address indexed keeper);
    event PausedUpdated(bool paused);
    event RoundFinalizationTriggered(uint256 indexed roundId);
    event GasWithdrawn(address indexed recipient, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyKeeper() {
        if (msg.sender != keeper && msg.sender != owner) revert NotKeeper();
        _;
    }

    constructor(address roundContract_, address keeper_) {
        if (roundContract_ == address(0) || keeper_ == address(0)) revert ZeroAddress();
        roundContract = ISoleFunRound(roundContract_);
        owner = msg.sender;
        keeper = keeper_;
    }

    function setKeeper(address keeper_) external onlyOwner {
        if (keeper_ == address(0)) revert ZeroAddress();
        keeper = keeper_;
        emit KeeperUpdated(keeper_);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedUpdated(paused_);
    }

    function checkUpkeep(uint256 roundId) public view returns (bool upkeepNeeded) {
        if (paused) return false;
        if (roundId == 0) roundId = roundContract.currentRoundId();
        if (roundId == 0) return false;

        (bool success, bytes memory data) =
            address(roundContract).staticcall(abi.encodeWithSelector(GET_ROUND_SELECTOR, roundId));
        if (!success || data.length < 15 * 32) return false;

        uint256 endsAt;
        uint256 finalized;
        assembly {
            endsAt := mload(add(data, 64))
            finalized := mload(add(data, 480))
        }
        return finalized == 0 && block.timestamp >= endsAt;
    }

    function performUpkeep(uint256 roundId) external onlyKeeper {
        if (paused || !checkUpkeep(roundId)) revert RoundNotReady();
        if (roundId == 0) roundId = roundContract.currentRoundId();

        roundContract.finalizeRound(roundId);
        emit RoundFinalizationTriggered(roundId);
    }

    /// @notice Withdraws only native gas funds accidentally sent to this contract.
    /// @dev The keeper never holds USDG prize funds; those remain in SoleFunRound.
    function withdrawGas(address payable recipient) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        uint256 amount = address(this).balance;
        (bool sent,) = recipient.call{ value: amount }("");
        require(sent, "gas withdrawal failed");
        emit GasWithdrawn(recipient, amount);
    }

    receive() external payable { }
}
