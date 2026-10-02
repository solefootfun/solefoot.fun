// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SoleFunKeeper } from "../contracts/SoleFunKeeper.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeploySoleFunKeeper {
    Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant ROUND = 0x81F2108A8B25943BdF26811714c78C6beF1704da;
    address internal constant TREASURY_KEEPER = 0x0d31ddB91b7073fb785e146e049b7F71F8D305Fc;

    function run() external returns (SoleFunKeeper keeperContract) {
        VM.startBroadcast();
        keeperContract = new SoleFunKeeper(ROUND, TREASURY_KEEPER);
        VM.stopBroadcast();
    }
}
