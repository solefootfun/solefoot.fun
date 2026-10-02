# Security and trust boundaries

solefoot currently runs on Robinhood Chain mainnet with real USDG. This document is intentionally
plain-spoken: tests and documentation are useful, but they are not the same as an independent audit.

## Current status

- Solidity tests: 27 checks, including fuzz and invariant/property coverage.
- Frontend build: `npm run build`.
- Live proof: deployment, ownership and settlement transactions are listed in `docs/LIVE_PROOF.md`.
- Independent audit: not completed.
- Live source verification: should be checked on Blockscout for the exact deployed addresses before
  public marketing claims say the contracts are verified.

## Owner powers

`SoleFunRound` uses `Ownable2Step`. The live owner is `SoleFunKeeperV2`, which forwards admin calls.

The Keeper V2 owner can:

- pause or unpause keeper automation;
- rotate the keeper signer wallet;
- change future-round cost and duration;
- change the future-round treasury;
- configure the future token gate;
- forward emergency recovery.

The keeper signer wallet can only call upkeep. It cannot choose the winner, change votes or withdraw
the pool directly.

## Emergency recovery

`SoleFunRound.emergencyWithdraw()` permanently stops the game and sends all contract-held USDG to
the immutable original deployer address. This is a recovery mechanism for critical failure, not a
normal treasury withdrawal.

Users should understand this trust tradeoff before depositing USDG.

## Launch recommendation

Before broader liquidity or paid promotion, move the Keeper V2 owner to a multisig or deploy a new
keeper/admin layer with stricter separation of duties. The current setup is acceptable for controlled
testing, but a single owner key is not ideal for a public money game.

## Operational risks

- VPS downtime can delay settlement, but cannot change the winner.
- The keeper wallet needs native gas.
- RPC outages can slow the UI and keeper.
- Pinata/IPFS failures can block photo submission or image display.
- A wallet UX issue can leave a user after approval but before submission; the app should keep clear
  messaging around the two-step approve + submit flow.

