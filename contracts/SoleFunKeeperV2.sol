// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISoleFunRoundV2 {
    struct Round {
        uint64 startsAt;
        uint64 endsAt;
        uint64 finalizedAt;
        uint64 snapshotBlock;
        uint256 entryFee;
        uint256 poolBalance;
        uint256 entryCount;
        uint256 winningEntryId;
        uint256 winnerAmount;
        uint256 buybackAmount;
        address treasury;
        address gateToken;
        uint256 minimumVotingPower;
        bool tokenGateEnabled;
        bool finalized;
    }

    function currentRoundId() external view returns (uint256);
    function getRound(uint256 roundId) external view returns (Round memory);
    function finalizeRound(uint256 roundId) external;
    function startRound() external returns (uint256);
    function acceptOwnership() external;
    function setNextRoundConfig(uint256 entryFee, uint64 duration) external;
    function setNextTreasury(address treasury) external;
    function setNextTokenGate(address gateToken, uint256 minimumVotingPower, bool enabled) external;
    function emergencyWithdraw() external;
}

/// @title SoleFunKeeperV2
/// @notice Finalizes ended rounds and starts the next round automatically.
/// @dev The main SoleFunRound ownership must be accepted by this contract first.
contract SoleFunKeeperV2 {
    ISoleFunRoundV2 public immutable roundContract;
    address public owner;
    address public keeper;
    bool public paused;

    error ZeroAddress();
    error NotOwner();
    error NotKeeper();
    error Paused();
    error RoundStillActive();

    event KeeperUpdated(address indexed keeper);
    event PausedUpdated(bool paused);
    event RoundFinalizedAndRestarted(uint256 indexed finalizedRoundId, uint256 indexed newRoundId);
    event RoundStarted(uint256 indexed roundId);

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
        roundContract = ISoleFunRoundV2(roundContract_);
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
        if (roundId == 0) return true;

        ISoleFunRoundV2.Round memory round = roundContract.getRound(roundId);
        return round.finalized || block.timestamp >= round.endsAt;
    }

    /// @notice Finalizes the current round when ready and starts the next one.
    /// @dev Also starts the first round when no round exists yet.
    function performUpkeep(uint256) external onlyKeeper {
        if (paused) revert Paused();

        uint256 current = roundContract.currentRoundId();
        if (current == 0) {
            uint256 firstRoundId = roundContract.startRound();
            emit RoundStarted(firstRoundId);
            return;
        }

        ISoleFunRoundV2.Round memory round = roundContract.getRound(current);
        if (!round.finalized) {
            if (block.timestamp < round.endsAt) revert RoundStillActive();
            roundContract.finalizeRound(current);
        }

        uint256 newRoundId = roundContract.startRound();
        emit RoundFinalizedAndRestarted(current, newRoundId);
    }

    function acceptRoundOwnership() external onlyOwner {
        roundContract.acceptOwnership();
    }

    function setNextRoundConfig(uint256 entryFee, uint64 duration) external onlyOwner {
        roundContract.setNextRoundConfig(entryFee, duration);
    }

    function setNextTreasury(address treasury) external onlyOwner {
        roundContract.setNextTreasury(treasury);
    }

    function setNextTokenGate(address gateToken, uint256 minimumVotingPower, bool enabled)
        external
        onlyOwner
    {
        roundContract.setNextTokenGate(gateToken, minimumVotingPower, enabled);
    }

    function emergencyWithdraw() external onlyOwner {
        roundContract.emergencyWithdraw();
    }
}
