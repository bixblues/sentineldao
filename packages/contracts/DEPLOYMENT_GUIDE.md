# SentinelDAO Deployment Guide

Complete guide to deploying ProtectedVault and CCIP contracts for your own SentinelDAO instance.

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) installed
- Testnet ETH on Sepolia (get from [faucet](https://sepoliafaucet.com/))
- LINK tokens on Sepolia (get from [Chainlink faucet](https://faucets.chain.link/sepolia))
- Alchemy API key (free tier works)

## Table of Contents

1. [Environment Setup](#1-environment-setup)
2. [Deploy ProtectedVault (Single Chain)](#2-deploy-protectedvault-single-chain)
3. [Deploy Multi-Chain Vaults](#3-deploy-multi-chain-vaults)
4. [Deploy CCIP Contracts (Cross-Chain Defense)](#4-deploy-ccip-contracts-cross-chain-defense)
5. [Configure Backend](#5-configure-backend)
6. [Test Your Deployment](#6-test-your-deployment)

---

## 1. Environment Setup

### Clone the Repository

```bash
git clone https://github.com/bixblues/sentineldao.git
cd sentineldao
```

### Install Dependencies

```bash
# Install Node.js dependencies
pnpm install

# Install Foundry dependencies
cd packages/contracts
forge install
```

### Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Copy example
cp .env.example .env
```

Edit `.env` and add your keys:

```bash
# Deployer Wallet (create a new wallet for testnet)
CRE_ETH_PRIVATE_KEY=0x...your_private_key_here

# RPC URLs (get from Alchemy)
ETHEREUM_SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
ARBITRUM_SEPOLIA_RPC=https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY
BASE_SEPOLIA_RPC=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sentinel

# API
JWT_SECRET=your_random_secret_here
API_KEY=your_api_key_here

# AI (optional - for threat analysis)
GEMINI_API_KEY=your_gemini_api_key_here
```

**⚠️ Security Warning:** Never commit your `.env` file to git!

---

## 2. Deploy ProtectedVault (Single Chain)

### Step 1: Navigate to Contracts Directory

```bash
cd packages/contracts
```

### Step 2: Deploy to Sepolia

```bash
forge script script/DeployVault.s.sol:DeployVault \
  --rpc-url $ETHEREUM_SEPOLIA_RPC \
  --private-key $CRE_ETH_PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

**Expected Output:**

```
== Logs ==
Deploying ProtectedVault...
Vault deployed at: 0xYourVaultAddress
Sentinel address: 0xYourDeployerAddress
```

### Step 3: Save the Vault Address

Copy the deployed vault address and add it to your `.env`:

```bash
VAULT_ADDRESS_SEPOLIA=0xYourVaultAddress
```

### Step 4: Fund the Vault (Optional)

Send some test ETH to test deposits:

```bash
cast send $VAULT_ADDRESS_SEPOLIA \
  --value 0.1ether \
  --rpc-url $ETHEREUM_SEPOLIA_RPC \
  --private-key $CRE_ETH_PRIVATE_KEY
```

---

## 3. Deploy Multi-Chain Vaults

Deploy the same vault contract on multiple chains for cross-chain defense.

### Deploy to Arbitrum Sepolia

```bash
forge script script/DeployVault.s.sol:DeployVault \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $CRE_ETH_PRIVATE_KEY \
  --broadcast
```

Save the address:

```bash
VAULT_ADDRESS_ARBITRUM=0xYourArbitrumVaultAddress
```

### Deploy to Base Sepolia

```bash
forge script script/DeployVault.s.sol:DeployVault \
  --rpc-url $BASE_SEPOLIA_RPC \
  --private-key $CRE_ETH_PRIVATE_KEY \
  --broadcast
```

Save the address:

```bash
VAULT_ADDRESS_BASE=0xYourBaseVaultAddress
```

---

## 4. Deploy CCIP Contracts (Cross-Chain Defense)

CCIP enables your Sepolia backend to pause vaults on other chains (Arbitrum, Base).

### Prerequisites

- LINK tokens on Sepolia (for CCIP fees)
- Deployed vaults on destination chains

### Step 1: Deploy CCIP Sender (Sepolia)

This contract sends cross-chain pause messages:

```bash
forge script script/DeployCCIPSender.s.sol:DeployCCIPSender \
  --rpc-url $ETHEREUM_SEPOLIA_RPC \
  --private-key $CRE_ETH_PRIVATE_KEY \
  --broadcast
```

**Expected Output:**

```
CCIP Sender deployed at: 0xYourCCIPSenderAddress
```

Save the address:

```bash
CCIP_SENDER_ADDRESS=0xYourCCIPSenderAddress
```

### Step 2: Fund CCIP Sender with LINK

The sender needs LINK to pay for cross-chain messages:

```bash
# Transfer 5 LINK to the sender contract
cast send 0x779877A7B0D9E8603169DdbD7836e478b4624789 \
  "transfer(address,uint256)" \
  $CCIP_SENDER_ADDRESS \
  5000000000000000000 \
  --rpc-url $ETHEREUM_SEPOLIA_RPC \
  --private-key $CRE_ETH_PRIVATE_KEY
```

**LINK Token Addresses:**
- Sepolia: `0x779877A7B0D9E8603169DdbD7836e478b4624789`
- Arbitrum Sepolia: `0xb1D4538B4571d411F07960EF2838Ce337FE1E80E`
- Base Sepolia: `0xE4aB69C077896252FAFBD49EFD26B5D171A32410`

### Step 3: Deploy CCIP Receiver (Arbitrum Sepolia)

This contract receives pause messages and pauses the vault:

```bash
forge script script/DeployCCIPReceiver.s.sol:DeployCCIPReceiver \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $CRE_ETH_PRIVATE_KEY \
  --broadcast
```

**Expected Output:**

```
CCIP Receiver deployed at: 0xYourCCIPReceiverAddress
Vault address: 0xYourArbitrumVaultAddress
```

Save the address:

```bash
CCIP_RECEIVER_ARBITRUM=0xYourCCIPReceiverAddress
```

### Step 4: Deploy CCIP Receiver (Base Sepolia)

```bash
forge script script/DeployCCIPReceiver.s.sol:DeployCCIPReceiver \
  --rpc-url $BASE_SEPOLIA_RPC \
  --private-key $CRE_ETH_PRIVATE_KEY \
  --broadcast
```

Save the address:

```bash
CCIP_RECEIVER_BASE=0xYourCCIPReceiverAddress
```

### Step 5: Set Receivers as Sentinels

The receivers need permission to pause the vaults:

**On Arbitrum Sepolia:**

```bash
cast send $VAULT_ADDRESS_ARBITRUM \
  "setSentinel(address)" \
  $CCIP_RECEIVER_ARBITRUM \
  --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $CRE_ETH_PRIVATE_KEY
```

**On Base Sepolia:**

```bash
cast send $VAULT_ADDRESS_BASE \
  "setSentinel(address)" \
  $CCIP_RECEIVER_BASE \
  --rpc-url $BASE_SEPOLIA_RPC \
  --private-key $CRE_ETH_PRIVATE_KEY
```

### Step 6: Verify CCIP Setup

Check LINK balance:

```bash
cast call 0x779877A7B0D9E8603169DdbD7836e478b4624789 \
  "balanceOf(address)(uint256)" \
  $CCIP_SENDER_ADDRESS \
  --rpc-url $ETHEREUM_SEPOLIA_RPC
```

Should return `5000000000000000000` (5 LINK).

---

## 5. Configure Backend

### Update `.env` with Deployed Addresses

Add all your deployed contract addresses:

```bash
# Vaults
VAULT_ADDRESS_SEPOLIA=0x...
VAULT_ADDRESS_ARBITRUM=0x...
VAULT_ADDRESS_BASE=0x...

# CCIP
CCIP_SENDER_ADDRESS=0x...
CCIP_RECEIVER_ARBITRUM=0x...
CCIP_RECEIVER_BASE=0x...
```

### Start the Backend

```bash
# From project root
cd apps/api
bun install
bun run dev
```

The API will start on `http://localhost:3001`.

### Start the Dashboard

```bash
# From project root
cd apps/dashboard
npm install
npm run dev
```

The dashboard will start on `http://localhost:3000`.

---

## 6. Test Your Deployment

### Test 1: Sign Up and Add Vaults

1. Open `http://localhost:3000`
2. Sign up for an account
3. Complete onboarding wizard
4. Add your deployed vault addresses

### Test 2: Deposit to Vault

```bash
# Deposit 0.15 ETH to trigger threat detection
cast send $VAULT_ADDRESS_SEPOLIA \
  "deposit()" \
  --value 0.15ether \
  --rpc-url $ETHEREUM_SEPOLIA_RPC \
  --private-key $CRE_ETH_PRIVATE_KEY
```

**Expected Result:**
- Dashboard shows new deposit event
- Threat detected (large deposit > 0.1 ETH threshold)
- AI analysis appears after 2-3 seconds

### Test 3: Attack Simulator

Use the built-in simulator in the dashboard:

1. Click the floating "Simulator" button
2. Select "Flash Loan Attack"
3. Click "Run Attack"
4. Watch the dashboard detect and respond

### Test 4: Cross-Chain Pause (CCIP)

Test CCIP cross-chain defense:

1. Go to Vaults page
2. Click "Emergency Pause All Chains"
3. Confirm the transaction
4. Wait 2-5 minutes for CCIP message delivery
5. Verify vaults on Arbitrum and Base are paused

Check vault status:

```bash
# Check Arbitrum vault
cast call $VAULT_ADDRESS_ARBITRUM \
  "paused()(bool)" \
  --rpc-url $ARBITRUM_SEPOLIA_RPC

# Check Base vault
cast call $VAULT_ADDRESS_BASE \
  "paused()(bool)" \
  --rpc-url $BASE_SEPOLIA_RPC
```

Both should return `true`.

---

## Troubleshooting

### Issue: "Insufficient LINK balance"

**Solution:** Fund the CCIP sender with more LINK:

```bash
cast send 0x779877A7B0D9E8603169DdbD7836e478b4624789 \
  "transfer(address,uint256)" \
  $CCIP_SENDER_ADDRESS \
  5000000000000000000 \
  --rpc-url $ETHEREUM_SEPOLIA_RPC \
  --private-key $CRE_ETH_PRIVATE_KEY
```

### Issue: "Only sentinel can pause"

**Solution:** Set the correct sentinel address:

```bash
cast send $VAULT_ADDRESS \
  "setSentinel(address)" \
  $YOUR_BACKEND_ADDRESS \
  --rpc-url $ETHEREUM_SEPOLIA_RPC \
  --private-key $CRE_ETH_PRIVATE_KEY
```

### Issue: "AI analysis not appearing"

**Solution:** Add Gemini API key to `.env`:

```bash
GEMINI_API_KEY=your_key_from_https://makersuite.google.com/app/apikey
```

Restart the API server.

### Issue: "CCIP message not delivered"

**Solution:** Check CCIP explorer:

- Sepolia: https://ccip.chain.link/msg/[messageId]
- Wait 2-5 minutes for cross-chain delivery
- Verify sender has enough LINK

---

## Contract Addresses Reference

### CCIP Router Addresses

- **Sepolia:** `0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59`
- **Arbitrum Sepolia:** `0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165`
- **Base Sepolia:** `0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93`

### CCIP Chain Selectors

- **Sepolia:** `16015286601757825753`
- **Arbitrum Sepolia:** `3478487238524512106`
- **Base Sepolia:** `10344971235874465080`

### LINK Token Addresses

- **Sepolia:** `0x779877A7B0D9E8603169DdbD7836e478b4624789`
- **Arbitrum Sepolia:** `0xb1D4538B4571d411F07960EF2838Ce337FE1E80E`
- **Base Sepolia:** `0xE4aB69C077896252FAFBD49EFD26B5D171A32410`

---

## Support

- **Documentation:** [README.md](./README.md)
- **GitHub Issues:** https://github.com/bixblues/sentineldao/issues
- **Contract Source:** [packages/contracts/src/](./packages/contracts/src/)

---

## Security Notes

- ✅ Always use a dedicated testnet wallet for deployment
- ✅ Never commit private keys or API keys to git
- ✅ Verify contracts on Etherscan after deployment
- ✅ Test thoroughly on testnet before mainnet deployment
- ✅ Keep LINK balance funded for CCIP operations
- ✅ Monitor sentinel wallet balance for gas fees

---

**Happy Deploying! 🚀**

For questions or issues, open a GitHub issue or check our documentation.
