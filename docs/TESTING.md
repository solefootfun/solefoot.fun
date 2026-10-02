# Testing guide

## Frontend production build

```bash
npm ci
npm run build
```

This checks TypeScript, compiles the App Router application and builds the API routes. Pinata upload
credentials are runtime configuration and must not be committed.

## Contract tests

```bash
forge fmt --check
forge test --offline
```

The current Foundry suite contains 25 tests across the round and keeper contracts.

`test/SoleFunRound.t.sol` covers:

1. default constructor configuration;
2. rejection of finalization before `endsAt`;
3. future-round configuration isolation;
4. most-voted winner and 70/30 settlement;
5. solo entrant receives 100%;
6. zero-entry finalization without fund movement;
7. one entry per wallet;
8. one vote per wallet;
9. tie behavior where the first entry to reach a score stays ahead;
10. metadata validation;
11. finalized-round vote rejection;
12. historical optional token gate behavior for entries and votes;
13. non-owner emergency withdrawal rejection;
14. owner emergency withdrawal and permanent stop;
15. fuzzed competitive payout accounting.

`test/SoleFunKeeperV2.t.sol` covers:

1. ownership acceptance for the round contract;
2. first-round startup;
3. unauthorized upkeep rejection;
4. pause behavior;
5. early upkeep rejection;
6. ended-round finalization and next-round startup;
7. keeper wallet rotation;
8. owner emergency forwarding;
9. non-owner emergency forwarding rejection.

## Continuous integration

`.github/workflows/ci.yml` runs two independent GitHub Actions jobs:

- `Web build` installs locked npm dependencies and runs `npm run build`.
- `Contract tests` installs Foundry, checks formatting and runs the complete Solidity suite offline.

Mainnet deployer keys, keeper credentials and Pinata secrets are not required to build or test.

## Coverage

Run coverage locally with:

```bash
forge coverage
```

Coverage is a map of executed Solidity branches, not a security proof. It is useful for finding
untouched paths before review or audit work.

Latest local coverage snapshot for the live contracts:

| Contract | Lines | Statements | Branches | Functions |
| --- | ---: | ---: | ---: | ---: |
| `SoleFunRound.sol` | 85.82% | 82.80% | 50.00% | 81.25% |
| `SoleFunKeeperV2.sol` | 82.22% | 78.43% | 72.73% | 75.00% |

The repository still includes the older `SoleFunKeeper.sol` deployment path and Foundry scripts,
which are not part of the live V2 system and lower the all-files aggregate coverage.

## What passing tests do not prove

The suite does not replace an independent audit, production monitoring or an end-to-end mainnet
settlement check. Operational failures can still come from RPC outages, insufficient keeper gas,
Pinata configuration, gateway availability, wallet UX or VPS downtime. The emergency withdrawal
path remains an explicit trust tradeoff: the owner can permanently stop the game and recover
contract-held USDG to the immutable creator address.
