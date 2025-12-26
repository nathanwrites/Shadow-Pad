# Shadow Pad

Shadow Pad is a full-stack FHEVM application for creating and selling confidential ERC-7984 tokens. It lets anyone deploy a privacy-preserving token through a factory, list all created tokens in the UI, buy tokens with ETH at a defined price, and decrypt their own balances using Zama's FHE tooling.

The project focuses on making confidential assets practical: it combines encrypted balances, a simple ETH purchase flow, and a frontend that surfaces all tokens created by users, without relying on mock data.

## Goals

- Make confidential token creation as simple as entering a name, symbol, total supply, and price.
- Keep on-chain balances encrypted while still enabling transparent sale mechanics.
- Provide a real token marketplace experience powered by a factory contract and a unified UI.
- Ensure users can decrypt only their own balances, using standard FHEVM flows.

## Problems This Solves

- Public token balances make it easy to profile users and markets. This project keeps balances encrypted by default.
- Deploying confidential tokens is usually complex and fragmented. A single factory streamlines it.
- Traditional token sales require custom UI and backend logic. Here the ETH purchase logic is native to the token contract.
- Users often cannot inspect their private balances without custom tooling. The app integrates decryption so users can view clear balances on demand.

## Advantages

- Privacy-first: balances are stored as encrypted euint64 values on-chain.
- Simple issuance: a single factory contract deploys ERC-7984 tokens.
- Predictable pricing: on-chain quote method computes required ETH for any amount.
- Non-custodial sale flow: token contract holds inventory and sells directly to buyers.
- End-to-end UX: create, list, buy, and decrypt in one interface.
- Deterministic supply tracking: total supply and remaining sale supply are tracked in clear for transparency.

## Key Features

- Create confidential ERC-7984 tokens with configurable name, symbol, supply, and price.
- List all tokens created by the factory and show on-chain metadata.
- Buy tokens with ETH, with exact quoting and automatic refunds for overpayment.
- Display encrypted balances and provide user-triggered decryption.
- Owner controls for token price updates and withdrawal of collected ETH.

## Technology Stack

Smart contracts:
- Solidity 0.8.27
- Hardhat + hardhat-deploy
- Zama FHEVM Solidity libraries
- OpenZeppelin Confidential ERC-7984 contracts

Frontend:
- React + Vite + TypeScript
- Viem for read-only contract calls
- Ethers v6 for write transactions
- RainbowKit and wagmi for wallet connections
- Zama relayer SDK for decryption flows
- Custom CSS (no Tailwind)

Infrastructure and tooling:
- Sepolia deployment support via Infura
- TypeChain for typed contract bindings
- Hardhat tasks for token creation, buying, and decryption

## Architecture Overview

Contracts:
- ConfidentialTokenFactory creates new ConfidentialERC7984Token instances and indexes them.
- ConfidentialERC7984Token implements ERC-7984 with encrypted balances and sale logic.
- ConfidentialUSDT is a minimal confidential token example (cUSDT) for reference.
- FHECounter remains as a basic FHEVM example contract.

Data flow:
- A token is created via the factory and minted to the token contract itself.
- Buyers call buy(amount) with ETH, receiving an encrypted transfer.
- Balances are queried with confidentialBalanceOf and decrypted client-side.
- The UI lists all tokens through the factory and reads token state via viem.

Confidentiality model:
- Balances are encrypted euint64 values on-chain.
- Users decrypt only their own balances using the Zama FHEVM relayer flow.
- Clear values are limited to total supply, remaining sale supply, price, and metadata.

## Contracts in Detail

ConfidentialTokenFactory:
- Stores all deployed token addresses and per-creator lists.
- Emits TokenCreated with creator, token address, and metadata.

ConfidentialERC7984Token:
- ERC-7984 token with encrypted balances.
- totalSupplyClear and remainingForSaleClear tracked in clear for sale visibility.
- pricePerTokenWei defines the price for 1 whole token (1_000_000 base units).
- quoteBuy returns required ETH using ceiling rounding to avoid underpayment.
- buy transfers encrypted amounts, updates remaining supply, and refunds excess ETH.
- setPricePerTokenWei and withdraw are owner-only.

Token amounts and pricing:
- Token base units: 1_000_000 per whole token.
- Default supply in tasks: 100000000000 base units (100,000 whole tokens).
- pricePerTokenWei is the ETH price per 1 whole token.

## Frontend in Detail

The frontend is located in `app/` and is built to reflect on-chain state only:
- Token list is built from the factory's getAllTokens output.
- Token metadata and sale parameters are read directly from each token contract.
- Write operations (create token, buy token, withdraw) use ethers.
- Read operations (listing, supply, price, encrypted balance) use viem.
- Decryption uses the Zama relayer SDK and the user's wallet signer.

The UI intentionally avoids local storage and relies solely on chain state and user wallet context.

## Project Structure

```
contracts/                  Smart contract source files
deploy/                     Hardhat deployment scripts
tasks/                      Hardhat tasks for factory and token operations
test/                       Contract tests
app/                        React frontend (Vite)
docs/                       Zama references used by this project
deployments/                Contract addresses and ABI artifacts by network
```

## Setup and Usage

### Requirements

- Node.js 20+
- npm 7+
- Sepolia ETH for deployment and testing

### Install Dependencies

Root (contracts and tasks):
```bash
npm install
```

Frontend:
```bash
cd app
npm install
```

### Contract Environment Configuration

Create a root `.env` file with:
```
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=your_private_key
ETHERSCAN_API_KEY=optional
```

Notes:
- Deployment uses a raw private key (no mnemonic).
- INFURA_API_KEY is required for Sepolia.
- ETHERSCAN_API_KEY is optional and only used for verification.

### Compile and Test

```bash
npm run compile
npm run test
```

### Local Node (Optional)

```bash
npm run chain
npm run deploy:localhost
```

### Deploy to Sepolia

```bash
npm run deploy:sepolia
```

Optional verification:
```bash
npm run verify:sepolia -- <DEPLOYED_ADDRESS>
```

### Hardhat Tasks

Get the factory address:
```bash
npx hardhat task:tokenFactory:address --network sepolia
```

List all tokens:
```bash
npx hardhat task:tokenFactory:list --network sepolia
```

Create a token:
```bash
npx hardhat task:token:create --network sepolia --name "My Token" --symbol "MTK" --supply 100000000000 --price 0.0001
```

Buy a token:
```bash
npx hardhat task:token:buy --network sepolia --token <TOKEN_ADDRESS> --amount 1000000
```

Decrypt a balance:
```bash
npx hardhat task:token:decrypt-balance --network sepolia --token <TOKEN_ADDRESS> --user <USER_ADDRESS>
```

### Frontend

Start the UI:
```bash
cd app
npm run dev
```

ABI sync requirement:
- The frontend must use ABI artifacts generated by the contracts.
- Copy the ABI from `deployments/sepolia` into `app/src/config/contracts.ts` when the contracts change.

Network usage:
- The frontend is intended for Sepolia and avoids localhost configuration.

## Operational Guide

Create a token:
- Open the app and connect a wallet.
- Enter token name, symbol, total supply, and price.
- Submit to deploy via the factory; the token address is added to the list.

Buy tokens:
- Select a token from the list.
- Enter the amount in base units and confirm the purchase.
- The contract calculates the exact ETH required and refunds any excess.

Decrypt balances:
- Open your token holdings in the UI.
- Trigger decryption to view the clear balance for your address.

## Limitations and Assumptions

- Balance privacy depends on FHEVM and the Zama relayer flow.
- Total supply and remaining sale supply are public by design.
- Price is a fixed value per token unless updated by the owner.
- The token contract holds the inventory; no external liquidity is provided.

## Future Roadmap

- Add on-chain metadata registry for richer token discovery.
- Support multiple pricing models (bonding curve or tiered pricing).
- Provide batch purchase and batch decryption flows.
- Add factory-level analytics for total volume and active tokens.
- Improve UX for token decimals and human-readable amounts.
- Expand test coverage to include sale edge cases and refund behavior.
- Add optional token-specific access controls for private sales.

## License

BSD-3-Clause-Clear. See `LICENSE`.
