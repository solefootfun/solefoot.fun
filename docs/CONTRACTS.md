# Contracts

## Live deployment

| Contract | Robinhood Chain address |
| --- | --- |
| `SoleFunRound` | [`0x81F2108A8B25943BdF26811714c78C6beF1704da`](https://robinhoodchain.blockscout.com/address/0x81F2108A8B25943BdF26811714c78C6beF1704da) |
| `SoleFunKeeperV2` | [`0x5956a06B5b2D93416392C04aF52c2c38864730f3`](https://robinhoodchain.blockscout.com/address/0x5956a06B5b2D93416392C04aF52c2c38864730f3) |
| USDG | [`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`](https://robinhoodchain.blockscout.com/address/0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168) |

## `SoleFunRound`

### Player actions

- `submitEntry(metadataURI)` transfers the active round's exact USDG entry price and creates one
  entry for the caller.
- `vote(entryId)` adds the caller's single vote to an existing entry.

Both actions enforce the optional token gate when it is enabled for that round. The gate is currently
disabled.

### Settlement

`finalizeRound(roundId)` can run only after the round's `endsAt` timestamp. With one entrant, the
entire pool returns to that entrant. With two or more entrants, 70% goes to the leading entry owner and
30% goes to the round's snapshotted treasury.

Equal vote totals keep the entry that reached the score first. The contract updates
`winningEntryId` as valid votes arrive; neither the UI nor keeper chooses the winner.

### Future-round configuration

- `setNextRoundConfig(entryFee, duration)`
- `setNextTreasury(treasury)`
- `setNextTokenGate(gateToken, minimumVotingPower, enabled)`

These owner-only methods never rewrite an active or finalized round.

### Emergency recovery

`emergencyWithdraw()` permanently stops new rounds, submissions, votes and normal finalization, then
transfers all contract-held USDG to the immutable wallet that originally deployed `SoleFunRound`.
The recipient cannot be selected at withdrawal time. This is an explicit owner trust assumption, not
a routine treasury function.

## `SoleFunKeeperV2`

The V2 keeper owns the round contract. Its `performUpkeep` function finalizes an ended current round
and starts the next round. The keeper can also start the first round when none exists.

The V2 owner can update the authorized keeper wallet, pause automation, forward future-round
configuration calls and invoke emergency recovery. The configured keeper wallet can perform upkeep
but cannot use owner configuration methods.

## Events used as proof

- `RoundStarted`
- `EntrySubmitted`
- `VoteCast`
- `LeaderChanged`
- `RoundFinalized`
- USDG `Transfer`

The frontend can reconstruct public round history from these events and link final settlement
transactions directly to Blockscout.
