# solefoot contracts

`SoleFunRound.sol` is the on-chain round and payout contract for solefoot.

## Live deployment

- Network: Robinhood Chain mainnet (`4663`)
- Round contract: [`0x81F2108A8B25943BdF26811714c78C6beF1704da`](https://robinhoodchain.blockscout.com/address/0x81F2108A8B25943BdF26811714c78C6beF1704da)
- Automation contract: [`0x5956a06B5b2D93416392C04aF52c2c38864730f3`](https://robinhoodchain.blockscout.com/address/0x5956a06B5b2D93416392C04aF52c2c38864730f3)
- Payment token: USDG (`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`)
- SOLE token: `0x0155c6D2B30cfB6f233e3F92a2F9Da1DB4BcF550`
- Buy link: `https://www.ponsfamily.com/launchpad/0x0155c6D2B30cfB6f233e3F92a2F9Da1DB4BcF550`
- Configured entry price: 1 USDG (`1000000` base units)
- Configured round duration: 24 hours (`86400` seconds)
- One entry per wallet per round
- One vote per wallet per round
- One participant: 100% of the pool goes back to that participant
- Two or more participants: 70% to the winner and 30% to the round treasury
- Token gate: disabled by default
- Emergency recovery: the owner can permanently stop the contract and withdraw all held USDG

The Solidity constructor defaults are intentionally 0.1 USDG and 60 seconds. The live 1 USDG / 24
hour configuration was set on-chain with `setNextRoundConfig` and is snapshotted into each new
round. Updating future-round settings never changes an active round.

The owner may update the fee, duration, treasury, and optional token gate only for future
rounds. Every round snapshots its complete configuration when it starts.

`emergencyWithdraw()` transfers the contract's complete USDG balance to the wallet that originally
deployed the contract and permanently stops new rounds, entries, votes, and normal finalization.
The destination cannot be selected or changed. This is an explicit owner trust assumption intended
only for manual recovery after a critical failure.

## Settlement

The contract continuously stores the leading entry as votes arrive. After `endsAt`, anyone
may call `finalizeRound(roundId)`. `SoleFunKeeperV2` is the main contract owner and allows the
authorized keeper wallet to finalize an ended round and start the next one in a single upkeep.
The keeper cannot choose or change the winner. The `RoundFinalized` event and USDG `Transfer`
logs are the on-chain payout proof used by the frontend.

Automation is operational infrastructure, not a property of the EVM itself: the VPS process must
remain online and the keeper wallet must have enough native gas. If it is temporarily offline,
funds remain in the round contract and settlement can be retried after `endsAt`.

## Robinhood Chain mainnet

- Chain ID: `4663`
- USDG: `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`
- Explorer: `https://robinhoodchain.blockscout.com`

The deployment script rejects every chain except Robinhood Chain mainnet.

## Commands

```bash
forge fmt --check
forge build --offline
forge test --offline -vv
```

Mainnet deployment requires the public `TREASURY_ADDRESS` environment variable. The deployer
automatically becomes the initial owner and immutable emergency withdrawal destination. Import the
deployer key into Foundry's encrypted keystore instead of placing a private key in a command or
`.env` file.

```bash
cast wallet import sole-fun-deployer --interactive

export TREASURY_ADDRESS=0x...

forge script script/DeploySoleFunRound.s.sol:DeploySoleFunRound \
  --rpc-url https://rpc.mainnet.chain.robinhood.com \
  --account sole-fun-deployer \
  --sender 0xDEPLOYER_ADDRESS \
  --broadcast \
  --verify \
  --verifier blockscout \
  --verifier-url https://robinhoodchain.blockscout.com/api/
```

## Security status

The included Foundry tests cover payout splits, solo-entry refunds, voting constraints, future-round
configuration, early-finalization rejection, token gating, keeper behavior, invariant/property pool
accounting, and emergency recovery. They are not an independent security audit. Do not treat this
repository or its tests as a guarantee of safety.

`SoleFunKeeper.sol` is retained as a legacy reference. The live automation contract is
`SoleFunKeeperV2.sol`.
