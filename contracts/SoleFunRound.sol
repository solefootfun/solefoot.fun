// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal interface required from the future SOLE token.
/// @dev The token should expose historical voting power, for example through ERC20Votes.
interface IHistoricalVotes {
    function getPastVotes(address account, uint256 timepoint) external view returns (uint256);
}

/// @title SoleFunRound
/// @notice Runs timed photo contests paid in USDG and settles prizes on-chain.
/// @dev Image bytes are stored off-chain. Only an immutable metadata URI is stored per entry.
contract SoleFunRound is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant WINNER_BASIS_POINTS = 7_000;
    uint256 public constant BUYBACK_BASIS_POINTS = 3_000;
    uint256 public constant DEFAULT_ENTRY_FEE = 100_000; // 0.1 USDG (6 decimals)
    uint64 public constant DEFAULT_ROUND_DURATION = 60; // 1 minute
    uint64 public constant MIN_ROUND_DURATION = 60;
    uint64 public constant MAX_ROUND_DURATION = 30 days;
    uint256 public constant MAX_METADATA_URI_LENGTH = 256;

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

    struct Entry {
        address owner;
        uint64 submittedAt;
        uint256 votes;
        string metadataURI;
    }

    IERC20 public immutable paymentToken;
    address public immutable contractCreator;

    uint256 public currentRoundId;
    uint256 public nextEntryFee;
    uint64 public nextRoundDuration;
    address public nextTreasury;
    address public nextGateToken;
    uint256 public nextMinimumVotingPower;
    bool public nextTokenGateEnabled;
    bool public emergencyStopped;

    mapping(uint256 roundId => Round round) private _rounds;
    mapping(uint256 roundId => mapping(uint256 entryId => Entry entry)) private _entries;
    mapping(uint256 roundId => mapping(address account => bool entered)) public hasEntered;
    mapping(uint256 roundId => mapping(address account => bool voted)) public hasVoted;

    error ZeroAddress();
    error InvalidEntryFee();
    error InvalidRoundDuration();
    error InvalidMetadataURI();
    error PreviousRoundNotFinalized();
    error RoundDoesNotExist();
    error RoundNotActive();
    error RoundStillActive();
    error RoundAlreadyFinalized();
    error AlreadyEntered();
    error AlreadyVoted();
    error EntryDoesNotExist();
    error TokenGateRequirementNotMet();
    error InvalidTokenGateConfiguration();
    error EmergencyStopActive();

    event NextRoundConfigUpdated(uint256 entryFee, uint64 duration);
    event NextTreasuryUpdated(address indexed treasury);
    event NextTokenGateUpdated(bool enabled, address indexed gateToken, uint256 minimumVotingPower);
    event RoundStarted(
        uint256 indexed roundId,
        uint64 startsAt,
        uint64 endsAt,
        uint256 entryFee,
        address indexed treasury,
        bool tokenGateEnabled,
        address gateToken,
        uint256 minimumVotingPower,
        uint64 snapshotBlock
    );
    event EntrySubmitted(
        uint256 indexed roundId,
        uint256 indexed entryId,
        address indexed owner,
        string metadataURI,
        uint256 entryFee
    );
    event VoteCast(
        uint256 indexed roundId,
        uint256 indexed entryId,
        address indexed voter,
        uint256 newVoteCount
    );
    event LeaderChanged(uint256 indexed roundId, uint256 indexed entryId, uint256 votes);
    event RoundFinalized(
        uint256 indexed roundId,
        uint256 indexed winningEntryId,
        address indexed winner,
        uint256 participantCount,
        uint256 winnerAmount,
        uint256 buybackAmount
    );
    event EmergencyWithdrawal(uint256 indexed roundId, address indexed recipient, uint256 amount);

    constructor(address paymentToken_, address treasury_) Ownable(msg.sender) {
        if (paymentToken_ == address(0) || treasury_ == address(0)) revert ZeroAddress();

        paymentToken = IERC20(paymentToken_);
        contractCreator = msg.sender;
        nextTreasury = treasury_;
        nextEntryFee = DEFAULT_ENTRY_FEE;
        nextRoundDuration = DEFAULT_ROUND_DURATION;
    }

    /// @notice Changes the fee and duration copied into the next round.
    /// @dev Active and finalized rounds are never modified by this function.
    function setNextRoundConfig(uint256 entryFee, uint64 duration) external onlyOwner {
        if (entryFee == 0) revert InvalidEntryFee();
        if (duration < MIN_ROUND_DURATION || duration > MAX_ROUND_DURATION) {
            revert InvalidRoundDuration();
        }

        nextEntryFee = entryFee;
        nextRoundDuration = duration;

        emit NextRoundConfigUpdated(entryFee, duration);
    }

    /// @notice Changes the treasury copied into the next round.
    function setNextTreasury(address treasury) external onlyOwner {
        if (treasury == address(0)) revert ZeroAddress();
        nextTreasury = treasury;
        emit NextTreasuryUpdated(treasury);
    }

    /// @notice Configures the optional token gate for future rounds.
    /// @dev When enabled, the gate token must implement getPastVotes.
    function setNextTokenGate(address gateToken, uint256 minimumVotingPower, bool enabled)
        external
        onlyOwner
    {
        if (enabled && (gateToken == address(0) || minimumVotingPower == 0)) {
            revert InvalidTokenGateConfiguration();
        }

        nextGateToken = enabled ? gateToken : address(0);
        nextMinimumVotingPower = enabled ? minimumVotingPower : 0;
        nextTokenGateEnabled = enabled;

        emit NextTokenGateUpdated(enabled, nextGateToken, nextMinimumVotingPower);
    }

    /// @notice Starts a new round using the currently configured next-round values.
    function startRound() external onlyOwner returns (uint256 roundId) {
        if (emergencyStopped) revert EmergencyStopActive();
        if (currentRoundId != 0 && !_rounds[currentRoundId].finalized) {
            revert PreviousRoundNotFinalized();
        }

        roundId = ++currentRoundId;
        uint64 startsAt = uint64(block.timestamp);
        uint64 endsAt = startsAt + nextRoundDuration;
        uint64 snapshotBlock = block.number == 0 ? 0 : uint64(block.number - 1);

        Round storage round = _rounds[roundId];
        round.startsAt = startsAt;
        round.endsAt = endsAt;
        round.snapshotBlock = snapshotBlock;
        round.entryFee = nextEntryFee;
        round.treasury = nextTreasury;
        round.gateToken = nextGateToken;
        round.minimumVotingPower = nextMinimumVotingPower;
        round.tokenGateEnabled = nextTokenGateEnabled;

        emit RoundStarted(
            roundId,
            startsAt,
            endsAt,
            nextEntryFee,
            nextTreasury,
            nextTokenGateEnabled,
            nextGateToken,
            nextMinimumVotingPower,
            snapshotBlock
        );
    }

    /// @notice Enters the active round after transferring its exact USDG entry fee.
    function submitEntry(string calldata metadataURI)
        external
        nonReentrant
        returns (uint256 entryId)
    {
        uint256 roundId = currentRoundId;
        Round storage round = _requireActiveRound(roundId);

        if (hasEntered[roundId][msg.sender]) revert AlreadyEntered();

        uint256 uriLength = bytes(metadataURI).length;
        if (uriLength == 0 || uriLength > MAX_METADATA_URI_LENGTH) {
            revert InvalidMetadataURI();
        }

        _requireEligible(round, msg.sender);

        hasEntered[roundId][msg.sender] = true;
        entryId = ++round.entryCount;

        Entry storage entry = _entries[roundId][entryId];
        entry.owner = msg.sender;
        entry.submittedAt = uint64(block.timestamp);
        entry.metadataURI = metadataURI;

        if (entryId == 1) {
            round.winningEntryId = entryId;
            emit LeaderChanged(roundId, entryId, 0);
        }

        round.poolBalance += round.entryFee;
        paymentToken.safeTransferFrom(msg.sender, address(this), round.entryFee);

        emit EntrySubmitted(roundId, entryId, msg.sender, metadataURI, round.entryFee);
    }

    /// @notice Casts one vote per wallet in the active round.
    /// @dev Equal scores keep the entry that reached the score first as the leader.
    function vote(uint256 entryId) external {
        uint256 roundId = currentRoundId;
        Round storage round = _requireActiveRound(roundId);

        if (hasVoted[roundId][msg.sender]) revert AlreadyVoted();
        if (entryId == 0 || entryId > round.entryCount) revert EntryDoesNotExist();

        _requireEligible(round, msg.sender);

        hasVoted[roundId][msg.sender] = true;
        Entry storage entry = _entries[roundId][entryId];
        uint256 newVoteCount = ++entry.votes;

        uint256 leaderId = round.winningEntryId;
        if (newVoteCount > _entries[roundId][leaderId].votes) {
            round.winningEntryId = entryId;
            emit LeaderChanged(roundId, entryId, newVoteCount);
        }

        emit VoteCast(roundId, entryId, msg.sender, newVoteCount);
    }

    /// @notice Finalizes an ended round and sends USDG directly to the winner and treasury.
    /// @dev Anyone may call this function. A keeper can call it automatically after endsAt.
    function finalizeRound(uint256 roundId) external nonReentrant {
        if (emergencyStopped) revert EmergencyStopActive();
        Round storage round = _rounds[roundId];

        if (!_roundExists(roundId)) revert RoundDoesNotExist();
        if (round.finalized) revert RoundAlreadyFinalized();
        if (block.timestamp < round.endsAt) revert RoundStillActive();

        round.finalized = true;
        round.finalizedAt = uint64(block.timestamp);

        if (round.entryCount == 0) {
            emit RoundFinalized(roundId, 0, address(0), 0, 0, 0);
            return;
        }

        uint256 winningEntryId = round.winningEntryId;
        address winner = _entries[roundId][winningEntryId].owner;
        uint256 winnerAmount;
        uint256 buybackAmount;

        if (round.entryCount == 1) {
            winnerAmount = round.poolBalance;
        } else {
            buybackAmount = (round.poolBalance * BUYBACK_BASIS_POINTS) / BASIS_POINTS;
            winnerAmount = round.poolBalance - buybackAmount;
        }

        round.winnerAmount = winnerAmount;
        round.buybackAmount = buybackAmount;

        paymentToken.safeTransfer(winner, winnerAmount);
        if (buybackAmount != 0) {
            paymentToken.safeTransfer(round.treasury, buybackAmount);
        }

        emit RoundFinalized(
            roundId, winningEntryId, winner, round.entryCount, winnerAmount, buybackAmount
        );
    }

    /// @notice Permanently stops the contract and withdraws all held USDG for manual recovery.
    /// @dev This is an explicit trust tradeoff: the owner can withdraw the active prize pool.
    function emergencyWithdraw() external onlyOwner nonReentrant {
        if (emergencyStopped) revert EmergencyStopActive();

        emergencyStopped = true;
        uint256 amount = paymentToken.balanceOf(address(this));

        if (amount != 0) {
            paymentToken.safeTransfer(contractCreator, amount);
        }

        emit EmergencyWithdrawal(currentRoundId, contractCreator, amount);
    }

    function getRound(uint256 roundId) external view returns (Round memory) {
        if (!_roundExists(roundId)) revert RoundDoesNotExist();
        return _rounds[roundId];
    }

    function getEntry(uint256 roundId, uint256 entryId) external view returns (Entry memory) {
        if (!_roundExists(roundId)) revert RoundDoesNotExist();
        if (entryId == 0 || entryId > _rounds[roundId].entryCount) {
            revert EntryDoesNotExist();
        }
        return _entries[roundId][entryId];
    }

    function isEligible(uint256 roundId, address account) external view returns (bool) {
        Round storage round = _rounds[roundId];
        if (!_roundExists(roundId)) revert RoundDoesNotExist();
        return _isEligible(round, account);
    }

    function _requireActiveRound(uint256 roundId) internal view returns (Round storage round) {
        round = _rounds[roundId];
        if (
            emergencyStopped || !_roundExists(roundId) || round.finalized
                || block.timestamp < round.startsAt || block.timestamp >= round.endsAt
        ) {
            revert RoundNotActive();
        }
    }

    function _requireEligible(Round storage round, address account) internal view {
        if (!_isEligible(round, account)) revert TokenGateRequirementNotMet();
    }

    function _isEligible(Round storage round, address account) internal view returns (bool) {
        if (!round.tokenGateEnabled) return true;

        return IHistoricalVotes(round.gateToken).getPastVotes(account, round.snapshotBlock)
            >= round.minimumVotingPower;
    }

    function _roundExists(uint256 roundId) internal view returns (bool) {
        return roundId != 0 && roundId <= currentRoundId;
    }
}
