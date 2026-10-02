// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SoleFunKeeperV2 } from "../contracts/SoleFunKeeperV2.sol";
import { SoleFunRound } from "../contracts/SoleFunRound.sol";

interface VmKeeper {
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function roll(uint256 blockNumber) external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
}

contract KeeperMockUSDG is ERC20 {
    constructor() ERC20("Mock Global Dollar", "USDG") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

contract SoleFunKeeperV2Test {
    VmKeeper internal constant VM =
        VmKeeper(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant KEEPER = address(0x0D31);
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant TREASURY = address(0xB0BACC);
    address internal constant ATTACKER = address(0xBAD);

    KeeperMockUSDG internal usdg;
    SoleFunRound internal game;
    SoleFunKeeperV2 internal keeper;

    function setUp() public {
        VM.roll(100);
        VM.warp(1_000_000);

        usdg = new KeeperMockUSDG();
        game = new SoleFunRound(address(usdg), TREASURY);
        keeper = new SoleFunKeeperV2(address(game), KEEPER);

        game.transferOwnership(address(keeper));
        keeper.acceptRoundOwnership();

        _fundAndApprove(ALICE);
        _fundAndApprove(BOB);
    }

    function testAcceptRoundOwnershipTransfersMainContractControlToKeeper() public view {
        require(game.owner() == address(keeper), "keeper is not round owner");
    }

    function testKeeperStartsTheFirstRound() public {
        require(keeper.checkUpkeep(0), "first round upkeep not needed");

        VM.prank(KEEPER);
        keeper.performUpkeep(0);

        _assertEq(game.currentRoundId(), 1, "first round not started");
        SoleFunRound.Round memory round = game.getRound(1);
        require(!round.finalized, "first round finalized");
    }

    function testUnauthorizedWalletCannotPerformUpkeep() public {
        VM.prank(ATTACKER);
        VM.expectRevert(SoleFunKeeperV2.NotKeeper.selector);
        keeper.performUpkeep(0);
    }

    function testPausedKeeperDoesNotReportOrPerformUpkeep() public {
        keeper.setPaused(true);

        require(!keeper.checkUpkeep(0), "paused upkeep should be false");

        VM.prank(KEEPER);
        VM.expectRevert(SoleFunKeeperV2.Paused.selector);
        keeper.performUpkeep(0);
    }

    function testCannotFinalizeAndRestartBeforeRoundEnds() public {
        VM.prank(KEEPER);
        keeper.performUpkeep(0);

        VM.prank(KEEPER);
        VM.expectRevert(SoleFunKeeperV2.RoundStillActive.selector);
        keeper.performUpkeep(0);
    }

    function testKeeperFinalizesEndedRoundAndStartsTheNextRound() public {
        VM.prank(KEEPER);
        keeper.performUpkeep(0);

        VM.prank(ALICE);
        game.submitEntry("ipfs://alice-foot");
        VM.prank(BOB);
        game.submitEntry("ipfs://bob-foot");

        SoleFunRound.Round memory firstRound = game.getRound(1);
        VM.warp(firstRound.endsAt);

        VM.prank(KEEPER);
        keeper.performUpkeep(0);

        firstRound = game.getRound(1);
        SoleFunRound.Round memory secondRound = game.getRound(2);

        require(firstRound.finalized, "first round not finalized");
        require(!secondRound.finalized, "second round finalized");
        _assertEq(game.currentRoundId(), 2, "next round not started");
        _assertEq(usdg.balanceOf(ALICE), 10_040_000, "winner was not paid");
        _assertEq(usdg.balanceOf(TREASURY), 60_000, "treasury was not paid");
    }

    function testOwnerCanUpdateKeeperWallet() public {
        address newKeeper = address(0xBEEF);
        keeper.setKeeper(newKeeper);

        VM.prank(KEEPER);
        VM.expectRevert(SoleFunKeeperV2.NotKeeper.selector);
        keeper.performUpkeep(0);

        VM.prank(newKeeper);
        keeper.performUpkeep(0);

        _assertEq(game.currentRoundId(), 1, "new keeper did not start round");
    }

    function testOwnerCanForwardEmergencyWithdraw() public {
        VM.prank(KEEPER);
        keeper.performUpkeep(0);

        VM.prank(ALICE);
        game.submitEntry("ipfs://alice-foot");

        keeper.emergencyWithdraw();

        require(game.emergencyStopped(), "round contract not stopped");
        _assertEq(usdg.balanceOf(address(this)), 100_000, "creator did not receive funds");
    }

    function testNonOwnerCannotForwardEmergencyWithdraw() public {
        VM.prank(ATTACKER);
        VM.expectRevert(SoleFunKeeperV2.NotOwner.selector);
        keeper.emergencyWithdraw();
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
