# Live proof

This page collects public evidence for the deployed solefoot system on Robinhood Chain mainnet.
It is not an audit and does not guarantee future operation. It shows what is currently deployed and
which on-chain transactions can be inspected.

## Network

```text
Network   Robinhood Chain mainnet
Chain ID  4663
Explorer  https://robinhoodchain.blockscout.com
```

## Contracts and wallets

| Component | Address | Evidence |
| --- | --- | --- |
| Round contract | `0x81F2108A8B25943BdF26811714c78C6beF1704da` | [Blockscout](https://robinhoodchain.blockscout.com/address/0x81F2108A8B25943BdF26811714c78C6beF1704da) |
| Keeper V2 | `0x5956a06B5b2D93416392C04aF52c2c38864730f3` | [Blockscout](https://robinhoodchain.blockscout.com/address/0x5956a06B5b2D93416392C04aF52c2c38864730f3) |
| USDG token | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | [Blockscout](https://robinhoodchain.blockscout.com/address/0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168) |
| SOLE token | `0x0155c6D2B30cfB6f233e3F92a2F9Da1DB4BcF550` | [Blockscout](https://robinhoodchain.blockscout.com/address/0x0155c6D2B30cfB6f233e3F92a2F9Da1DB4BcF550) |
| Keeper signer / treasury | `0x0d31ddB91b7073fb785e146e049b7F71F8D305Fc` | [Blockscout](https://robinhoodchain.blockscout.com/address/0x0d31ddB91b7073fb785e146e049b7F71F8D305Fc) |

## Deployment and ownership evidence

| Action | Transaction |
| --- | --- |
| Round contract deployment | [`0x0e10…ddba`](https://robinhoodchain.blockscout.com/tx/0x0e10d5bb5ba464b5a5ed76de8310c268adf234b856bb59f540417c4b647fddba) |
| Keeper V2 deployment | [`0x14d5…f41e`](https://robinhoodchain.blockscout.com/tx/0x14d5e582499281a92398d094a980df648cbbde9444c7072e951fd87493e7f41e) |
| Round ownership transfer to Keeper V2 | [`0xcbaa…80df`](https://robinhoodchain.blockscout.com/tx/0xcbaaa7109118292f4fdfa13fcb7d70076870a1b11c1532e13c1620ccba7c80df) |
| Keeper V2 accepted round ownership | [`0xdec8…68ca4`](https://robinhoodchain.blockscout.com/tx/0xdec812b4330e1b9cd058571d14f0b9f51ac20eada99fe16f1e10045b28668ca4) |
| Live config changed to 1 USDG / 24 hours | [`0x4ab5…273fa`](https://robinhoodchain.blockscout.com/tx/0x4ab55053277b29940c2529de59d4b5252e0ecec535a353aeed92bbf7f5b273fa) |

## Settlement evidence

The keeper finalized an ended round and started the next round in this transaction:

[`0x0b5a9e981c803e1231535b318bf614e7a68e4f81a09801484300d134452caf46`](https://robinhoodchain.blockscout.com/tx/0x0b5a9e981c803e1231535b318bf614e7a68e4f81a09801484300d134452caf46)

Use the explorer logs to inspect `RoundFinalized`, payout amounts and the next `RoundStarted`
event. For competitive rounds, the winner receives 70% of the round pool and the treasury receives
30%. For solo rounds, the sole entrant receives 100% and the treasury receives 0.

## Operational assumptions

- The VPS keeper process must keep running.
- The keeper signer needs native gas on Robinhood Chain.
- The frontend reads from the Robinhood RPC and Pinata/IPFS gateways.
- Photo uploads require the server-side `PINATA_JWT` environment variable.
- If the keeper is offline after `endsAt`, funds remain in the round contract until upkeep is
  retried or the contract owner uses the documented emergency path.

## Trust boundary

The contracts are not independently audited. The emergency withdrawal path is intentionally present
for manual recovery: the owner can permanently stop the game and send all contract-held USDG to the
immutable creator address. Treat this as an explicit trust tradeoff.
