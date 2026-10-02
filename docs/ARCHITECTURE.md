# System architecture

## Components

### Web application

The Next.js application reads round state from Robinhood Chain without requiring a connected wallet.
A wallet is required only for state-changing actions such as approving USDG, submitting an entry and
voting. UI counters are derived from the active round's on-chain `endsAt` timestamp.

### Photo and metadata path

The camera produces the photo locally. A server-only API route sends the upload to Pinata and returns
an IPFS URI. The browser submits that URI to `SoleFunRound`; the Solidity contract never stores image
bytes. The Pinata JWT stays in `.env.local` or the production host's encrypted environment variables.

An entry is shown as confirmed only after its `submitEntry` transaction succeeds on-chain. A local
preview is not counted as an entry and does not increase the displayed pool.

### Round contract

`SoleFunRound` snapshots entry price, duration, treasury and token-gate configuration when a round
starts. Later configuration updates apply only to future rounds. The contract stores entry ownership,
metadata URI, votes, pool accounting and settlement results.

### Automation contract and VPS

The main round contract is owned by `SoleFunKeeperV2`. The keeper contract accepts upkeep only from
its configured keeper wallet or owner. The Node.js process on the VPS checks whether the current round
has ended, submits `performUpkeep`, waits for confirmation and repeats.

The VPS process is supervised by PM2 and restored through systemd after a reboot. It must retain:

- a working Robinhood Chain RPC endpoint;
- an encrypted keeper keystore and password available only on the VPS;
- enough native gas in the keeper wallet;
- a healthy PM2 process.

The keeper cannot change vote totals, choose an entry or settle early. Temporary downtime delays
settlement but does not give custody of the pool to the VPS.

## Data authority

| Data | Authority |
| --- | --- |
| Active round, timer and entry price | `SoleFunRound` state |
| Pool and entry count | `SoleFunRound` state and events |
| Entry photo URI | `EntrySubmitted` event / contract getter |
| Vote count and leader | Contract state |
| Winner and payout | `RoundFinalized` plus USDG `Transfer` logs |
| Image bytes | IPFS gateway |

## Failure behavior

- If IPFS upload fails, no entry transaction should be submitted.
- If USDG approval fails, the entry does not exist on-chain.
- If entry submission reverts, the preview must not be counted as confirmed.
- If the keeper is offline, an ended round remains unfinalized until upkeep is successfully called.
- If the RPC is unavailable, the UI should report that live chain data cannot currently be loaded.
