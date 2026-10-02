// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SoleFunRound } from "../contracts/SoleFunRound.sol";

interface Vm {
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function warp(uint256 timestamp) external;
    function roll(uint256 blockNumber) external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
}

contract MockUSDG is ERC20 {
    constructor() ERC20("Mock Global Dollar", "USDG") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

contract MockHistoricalVotes {
    mapping(address account => uint256 votes) public votingPower;

    function setVotingPower(address account, uint256 votes) external {
        votingPower[account] = votes;
    }

    function getPastVotes(address account, uint256) external view returns (uint256) {
        return votingPower[account];
    }
}

contract SoleFunRoundTest {
    Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant CAROL = address(0xCA401);
    address internal constant DAVE = address(0xDA7E);
    address internal constant TREASURY = address(0xB0BACC);
    MockUSDG internal usdg;
    SoleFunRound internal game;

    function setUp() public {
        VM.roll(100);
        VM.warp(1_000_000);

        usdg = new MockUSDG();
        game = new SoleFunRound(address(usdg), TREASURY);

        _fundAndApprove(ALICE);
        _fundAndApprove(BOB);
        _fundAndApprove(CAROL);
        _fundAndApprove(DAVE);
    }

    function testDefaultConfigUsesOneMinuteAndPointOneUSDG() public {
        _assertEq(game.nextEntryFee(), 100_000, "wrong default entry fee");
        _assertEq(game.nextRoundDuration(), 60, "wrong default duration");

        game.startRound();
        SoleFunRound.Round memory round = game.getRound(1);

        _assertEq(round.entryFee, 100_000, "round fee not snapshotted");
        _assertEq(round.endsAt - round.startsAt, 60, "round duration not snapshotted");
    }

    function testSoloEntrantReceivesTheEntirePool() public {
        game.startRound();

        VM.prank(ALICE);
        game.submitEntry("ipfs://alice-foot");

        _assertEq(usdg.balanceOf(ALICE), 9_900_000, "entry fee not collected");

        SoleFunRound.Round memory round = game.getRound(1);
        VM.warp(round.endsAt);
        VM.prank(CAROL);
        game.finalizeRound(1);

        _assertEq(usdg.balanceOf(ALICE), 10_000_000, "solo entrant did not receive full pool");
        _assertEq(usdg.balanceOf(TREASURY), 0, "treasury received solo-round funds");

        round = game.getRound(1);
        _assertEq(round.winnerAmount, 100_000, "wrong solo winner amount");
        _assertEq(round.buybackAmount, 0, "wrong solo buyback amount");
    }

    function testMostVotedEntryWinsAndPoolSplitsSeventyThirty() public {
        game.startRound();

        VM.prank(ALICE);
        game.submitEntry("ipfs://alice-foot");
        VM.prank(BOB);
        game.submitEntry("ipfs://bob-foot");

        VM.prank(CAROL);
        game.vote(2);
        VM.prank(DAVE);
        game.vote(2);

        SoleFunRound.Round memory round = game.getRound(1);
        _assertEq(round.winningEntryId, 2, "wrong leader");

        VM.warp(round.endsAt);
        game.finalizeRound(1);

        _assertEq(usdg.balanceOf(BOB), 10_040_000, "winner did not receive seventy percent");
        _assertEq(usdg.balanceOf(TREASURY), 60_000, "treasury did not receive thirty percent");

        round = game.getRound(1);
        _assertEq(round.winnerAmount, 140_000, "wrong winner amount");
        _assertEq(round.buybackAmount, 60_000, "wrong buyback amount");
    }

    function testWalletCanVoteOnlyOncePerRound() public {
        game.startRound();
        VM.prank(ALICE);
        game.submitEntry("ipfs://alice-foot");
        VM.prank(BOB);
        game.submitEntry("ipfs://bob-foot");

        VM.startPrank(CAROL);
        game.vote(1);
        VM.expectRevert(SoleFunRound.AlreadyVoted.selector);
        game.vote(2);
        VM.stopPrank();
    }

    function testConfigChangesOnlyAffectTheNextRound() public {
        game.startRound();
        game.setNextRoundConfig(1_000_000, 24 hours);

        SoleFunRound.Round memory firstRound = game.getRound(1);
        _assertEq(firstRound.entryFee, 100_000, "active fee changed");
        _assertEq(firstRound.endsAt - firstRound.startsAt, 60, "active duration changed");

        VM.warp(firstRound.endsAt);
        game.finalizeRound(1);
        game.startRound();

        SoleFunRound.Round memory secondRound = game.getRound(2);
        _assertEq(secondRound.entryFee, 1_000_000, "next fee not applied");
        _assertEq(secondRound.endsAt - secondRound.startsAt, 24 hours, "next duration not applied");
    }

    function testOptionalTokenGateUsesRoundSnapshotConfiguration() public {
        MockHistoricalVotes gateToken = new MockHistoricalVotes();
        uint256 minimumVotingPower = 50_000 ether;

        gateToken.setVotingPower(ALICE, minimumVotingPower);
        game.setNextTokenGate(address(gateToken), minimumVotingPower, true);
        game.startRound();

        VM.prank(BOB);
        VM.expectRevert(SoleFunRound.TokenGateRequirementNotMet.selector);
        game.submitEntry("ipfs://bob-foot");

        VM.prank(ALICE);
        game.submitEntry("ipfs://alice-foot");
    }

    function testCannotFinalizeBeforeTheRoundEnds() public {
        game.startRound();
        VM.expectRevert(SoleFunRound.RoundStillActive.selector);
        game.finalizeRound(1);
    }

    function testOwnerCanEmergencyWithdrawAllUSDGAndPermanentlyStopContract() public {
        game.startRound();

        VM.prank(ALICE);
        game.submitEntry("ipfs://alice-foot");

        game.emergencyWithdraw();

        _assertEq(usdg.balanceOf(address(this)), 100_000, "creator did not receive USDG");
        require(game.emergencyStopped(), "contract was not stopped");

        VM.prank(BOB);
        VM.expectRevert(SoleFunRound.RoundNotActive.selector);
        game.submitEntry("ipfs://bob-foot");

        VM.expectRevert(SoleFunRound.EmergencyStopActive.selector);
        game.finalizeRound(1);
    }

    function testNonOwnerCannotEmergencyWithdraw() public {
        game.startRound();

        VM.prank(ALICE);
        game.submitEntry("ipfs://alice-foot");

        VM.prank(BOB);
        VM.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, BOB));
        game.emergencyWithdraw();
    }

    function _fundAndApprove(address account) internal {
        usdg.mint(account, 10_000_000);
        VM.prank(account);
        usdg.approve(address(game), type(uint256).max);
    }

    function _assertEq(uint256 actual, uint256 expected, string memory message) internal pure {
        require(actual == expected, message);
    }
}
