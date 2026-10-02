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
forge test -vv
```

The current suite in `test/SoleFunRound.t.sol` contains nine tests:

1. default constructor configuration;
2. rejection of finalization before `endsAt`;
3. future-round configuration isolation;
4. most-voted winner and 70/30 settlement;
5. solo entrant receives 100%;
6. one vote per wallet;
7. historical optional token gate behavior;
8. non-owner emergency withdrawal rejection;
9. owner emergency withdrawal and permanent stop.

## Continuous integration

The frontend and contract commands above are designed to run independently in any CI provider.
Mainnet deployer keys, keeper credentials and Pinata secrets are not required to build or test.

## What passing tests do not prove

The suite does not replace an independent audit, production monitoring or an end-to-end mainnet
settlement check. Operational failures can still come from RPC outages, insufficient keeper gas,
Pinata configuration, gateway availability, wallet UX or VPS downtime.
