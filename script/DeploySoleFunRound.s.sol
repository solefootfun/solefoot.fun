// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SoleFunRound } from "../contracts/SoleFunRound.sol";

interface Vm {
    function envAddress(string calldata name) external returns (address value);
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeploySoleFunRound {
    uint256 internal constant ROBINHOOD_CHAIN_ID = 4663;
    address internal constant ROBINHOOD_MAINNET_USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    error WrongChain(uint256 actualChainId);

    function run() external returns (SoleFunRound deployed) {
        if (block.chainid != ROBINHOOD_CHAIN_ID) revert WrongChain(block.chainid);

        address treasury = VM.envAddress("TREASURY_ADDRESS");

        VM.startBroadcast();
        deployed = new SoleFunRound(ROBINHOOD_MAINNET_USDG, treasury);
        VM.stopBroadcast();
    }
}
