// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SoleFunKeeperV2 } from "../contracts/SoleFunKeeperV2.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeploySoleFunKeeperV2 {
    Vm internal constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant ROUND = 0x81F2108A8B25943BdF26811714c78C6beF1704da;
    address internal constant KEEPER_WALLET = 0x0d31ddB91b7073fb785e146e049b7F71F8D305Fc;

    function run() external returns (SoleFunKeeperV2 keeperContract) {
        VM.startBroadcast();
        keeperContract = new SoleFunKeeperV2(ROUND, KEEPER_WALLET);
        VM.stopBroadcast();
    }
}
