// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SoleFunRound } from "../contracts/SoleFunRound.sol";

interface VmInvariant {
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function roll(uint256 blockNumber) external;
}

contract InvariantUSDG is ERC20 {
    constructor() ERC20("Invariant Global Dollar", "USDG") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }
}

contract SoleFunRoundInvariantHandler {
    VmInvariant internal constant VM =
        VmInvariant(address(uint160(uint256(keccak256("hevm cheat code")))));

    SoleFunRound public immutable game;
    InvariantUSDG public immutable usdg;
    address public immutable owner;

    address[6] internal actors = [
        address(0xA11CE),
        address(0xB0B),
        address(0xCA401),
        address(0xDA7E),
        address(0xE11E),
        address(0xF00D)
    ];

    constructor(SoleFunRound game_, InvariantUSDG usdg_, address owner_) {
        game = game_;
        usdg = usdg_;
        owner = owner_;

        for (uint256 i; i < actors.length; i += 1) {
            usdg.mint(actors[i], 1_000_000_000);
            VM.prank(actors[i]);
            usdg.approve(address(game), type(uint256).max);
        }
    }

    function startRound() external {
        if (game.emergencyStopped()) return;

        uint256 currentRoundId = game.currentRoundId();
        if (currentRoundId != 0) {
            SoleFunRound.Round memory currentRound = game.getRound(currentRoundId);
            if (!currentRound.finalized) return;
        }

        VM.prank(owner);
        try game.startRound() { } catch { }
    }

    function enter(uint8 actorSeed, uint8 uriSeed) external {
        if (game.emergencyStopped()) return;

        uint256 currentRoundId = game.currentRoundId();
        if (currentRoundId == 0) return;

        SoleFunRound.Round memory currentRound = game.getRound(currentRoundId);
        if (currentRound.finalized || block.timestamp >= currentRound.endsAt) return;

        address actor = actors[actorSeed % actors.length];
        string memory uri = string(abi.encodePacked("ipfs://invariant-", _hex(uriSeed)));

        VM.prank(actor);
        try game.submitEntry(uri) { } catch { }
    }

    function vote(uint8 voterSeed, uint256 entrySeed) external {
        if (game.emergencyStopped()) return;

        uint256 currentRoundId = game.currentRoundId();
        if (currentRoundId == 0) return;

        SoleFunRound.Round memory currentRound = game.getRound(currentRoundId);
        if (
            currentRound.finalized || block.timestamp >= currentRound.endsAt
                || currentRound.entryCount == 0
        ) {
            return;
        }

        address voter = actors[voterSeed % actors.length];
        uint256 entryId = (entrySeed % currentRound.entryCount) + 1;

        VM.prank(voter);
        try game.vote(entryId) { } catch { }
    }

    function warpForward(uint32 secondsForward) external {
        uint256 jump = uint256(secondsForward % 3 days);
        VM.warp(block.timestamp + jump);
        VM.roll(block.number + 1);
    }

    function finalizeCurrentRound() external {
        if (game.emergencyStopped()) return;

        uint256 currentRoundId = game.currentRoundId();
        if (currentRoundId == 0) return;

        SoleFunRound.Round memory currentRound = game.getRound(currentRoundId);
        if (currentRound.finalized || block.timestamp < currentRound.endsAt) return;

        try game.finalizeRound(currentRoundId) { } catch { }
    }

    function emergencyWithdraw() external {
        if (game.emergencyStopped() || game.currentRoundId() == 0) return;

        VM.prank(owner);
        try game.emergencyWithdraw() { } catch { }
    }

    function _hex(uint8 value) private pure returns (bytes memory out) {
        bytes16 alphabet = "0123456789abcdef";
        out = new bytes(2);
        out[0] = alphabet[value >> 4];
        out[1] = alphabet[value & 0x0f];
    }
}

contract SoleFunRoundInvariantTest {
    VmInvariant internal constant VM =
        VmInvariant(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant TREASURY = address(0xB0BACC);

    InvariantUSDG internal usdg;
    SoleFunRound internal game;
    SoleFunRoundInvariantHandler internal handler;

    function setUp() public {
        VM.roll(100);
        VM.warp(1_000_000);

        usdg = new InvariantUSDG();
        game = new SoleFunRound(address(usdg), TREASURY);
        handler = new SoleFunRoundInvariantHandler(game, usdg, address(this));
    }

    function targetContracts() public view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    function invariant_heldUSDGMatchesTheOnlyUnsettledPool() public view {
        uint256 held = usdg.balanceOf(address(game));

        if (game.emergencyStopped()) {
            require(held == 0, "emergency left USDG in contract");
            return;
        }

        uint256 currentRoundId = game.currentRoundId();
        if (currentRoundId == 0) {
            require(held == 0, "funds held before first round");
            return;
        }

        SoleFunRound.Round memory currentRound = game.getRound(currentRoundId);
        uint256 expectedHeld = currentRound.finalized ? 0 : currentRound.poolBalance;
        require(held == expectedHeld, "held USDG differs from active pool");
    }

    function invariant_settledPayoutsNeverExceedTheirRoundPool() public view {
        uint256 currentRoundId = game.currentRoundId();

        for (uint256 roundId = 1; roundId <= currentRoundId; roundId += 1) {
            SoleFunRound.Round memory round = game.getRound(roundId);
            require(
                round.winnerAmount + round.buybackAmount <= round.poolBalance,
                "settled payout exceeds pool"
            );

            if (round.finalized && round.entryCount <= 1) {
                require(round.buybackAmount == 0, "solo or empty round sent buyback");
            }
        }
    }
}
