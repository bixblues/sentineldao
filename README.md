# SentinelDAO

> AI-powered DeFi vault defense using Chainlink CRE, CCIP, and LLM for autonomous threat response

[![Chainlink](https://img.shields.io/badge/Chainlink-CRE%20%2B%20CCIP-375BD2?logo=chainlink)](https://chain.link/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 🎯 Overview

SentinelDAO is an autonomous security layer for DeFi protocols that combines AI-powered threat analysis with Chainlink's decentralized infrastructure to protect multi-chain vault systems. It detects suspicious activities in real-time, analyzes threats using LLM-based risk scoring, and executes automated defense mechanisms including cross-chain emergency pauses via CCIP.

### Key Features

- 🔍 **Decentralized Monitoring** - Chainlink CRE DON consensus for event detection
- 🤖 **AI Threat Analysis** - Google Gemini LLM integration for intelligent risk scoring
- ⚡ **Sub-Second Response** - Automated emergency pause execution
- 🌐 **Cross-Chain Defense** - CCIP-powered pause propagation across all chains
- 🏢 **Multi-Tenant** - Institutional-grade architecture with isolated configurations
- 📊 **Real-Time Dashboard** - Live threat monitoring and attack simulation

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CHAINLINK CRE DON                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  EVM Log Triggers (Deposit, Withdrawal, EmergencyPause)  │  │
│  │  • Ethereum Sepolia                                       │  │
│  │  • Arbitrum Sepolia                                       │  │
│  │  • Base Sepolia                                           │  │
│  └────────────────────┬─────────────────────────────────────┘  │
└─────────────────────────┼────────────────────────────────────────┘
                          │ Webhook
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    THREAT ENGINE (Backend)                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Pattern Detection + AI Analysis (Google Gemini)         │  │
│  │  • Flash loan detection                                   │  │
│  │  • TVL drain detection                                    │  │
│  │  • Rapid transaction analysis                             │  │
│  │  • Whale movement tracking                                │  │
│  └────────────────────┬─────────────────────────────────────┘  │
└─────────────────────────┼────────────────────────────────────────┘
                          │ High Severity Threat
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                  DEFENSE EXECUTOR                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Emergency Pause + CCIP Cross-Chain Propagation          │  │
│  └────────────────────┬─────────────────────────────────────┘  │
└─────────────────────────┼────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
   ┌─────────┐      ┌─────────┐      ┌─────────┐
   │ Sepolia │      │   Arb   │      │  Base   │
   │  Vault  │◄─────│ Sepolia │◄─────│ Sepolia │
   └─────────┘ CCIP └─────────┘ CCIP └─────────┘
```

## 🔗 Chainlink Integration

### Chainlink CRE (Runtime Environment)

**Primary Workflow:** Vault Event Monitor

- **Location:** [`packages/cre-workflows/sentinel-defense/main.ts`](packages/cre-workflows/sentinel-defense/main.ts)
- **Triggers:** EVM Log (Deposit, Withdrawal, EmergencyPause events)
- **Chains Monitored:**
  - Ethereum Sepolia (Chain Selector: 16015286601757825753)
  - Arbitrum Sepolia (Chain Selector: 3478487238524512106)
  - Base Sepolia (Chain Selector: 10344971235874465080)
- **Integration:** Webhook POST to backend threat engine
- **Purpose:** Decentralized event detection with DON consensus

**Backend Integration:**
- Webhook Handler: [`apps/api/src/routes/webhooks.ts`](apps/api/src/routes/webhooks.ts) (lines 50-120)
- Threat Engine: [`apps/api/src/services/threat-engine.ts`](apps/api/src/services/threat-engine.ts)

### Chainlink CCIP (Cross-Chain Interoperability Protocol)

**Smart Contracts:**
- CCIP Sender: [`packages/contracts/src/SentinelCCIPSender.sol`](packages/contracts/src/SentinelCCIPSender.sol)
- CCIP Receiver: [`packages/contracts/src/SentinelCCIPReceiver.sol`](packages/contracts/src/SentinelCCIPReceiver.sol)
- Deployment Scripts:
  - [`packages/contracts/script/DeployCCIPSender.s.sol`](packages/contracts/script/DeployCCIPSender.s.sol)
  - [`packages/contracts/script/DeployCCIPReceiver.s.sol`](packages/contracts/script/DeployCCIPReceiver.s.sol)

**Backend Integration:**
- Defense Executor: [`apps/api/src/services/defense-executor.ts`](apps/api/src/services/defense-executor.ts) (lines 150-250)
- CCIP Routes: [`apps/api/src/routes/vaults.ts`](apps/api/src/routes/vaults.ts) (lines 200-280)

**Frontend Integration:**
- CCIP Status UI: [`apps/dashboard/src/components/pages/vaults.tsx`](apps/dashboard/src/components/pages/vaults.tsx) (lines 580-650)
- API Client: [`apps/dashboard/src/lib/api.ts`](apps/dashboard/src/lib/api.ts) (lines 280-310)

### Deployed Contracts (Testnets)

**ProtectedVault Contracts:**
- Ethereum Sepolia: [`0xcdCc7e3d66221c22A7D2c1490120e199568fd11D`](https://sepolia.etherscan.io/address/0xcdCc7e3d66221c22A7D2c1490120e199568fd11D)
- Arbitrum Sepolia: [`0x24Ae95b0b57e07fC65C79aD133Db6e398722B4A1`](https://sepolia.arbiscan.io/address/0x24Ae95b0b57e07fC65C79aD133Db6e398722B4A1)
- Base Sepolia: [`0x24Ae95b0b57e07fC65C79aD133Db6e398722B4A1`](https://sepolia.basescan.org/address/0x24Ae95b0b57e07fC65C79aD133Db6e398722B4A1)

**CCIP Contracts:**
- Sender (Sepolia): [`0x4126f0B31FB03e650D96a1aA769F2f1A5DE16f77`](https://sepolia.etherscan.io/address/0x4126f0B31FB03e650D96a1aA769F2f1A5DE16f77)
- Receiver (Arbitrum): [`0xcdCc7e3d66221c22A7D2c1490120e199568fd11D`](https://sepolia.arbiscan.io/address/0xcdCc7e3d66221c22A7D2c1490120e199568fd11D)
- Receiver (Base): [`0xcdCc7e3d66221c22A7D2c1490120e199568fd11D`](https://sepolia.basescan.org/address/0xcdCc7e3d66221c22A7D2c1490120e199568fd11D)

## 🛠️ Tech Stack

### Smart Contracts
- Solidity 0.8.24
- Foundry (Forge, Cast, Anvil)
- OpenZeppelin Contracts
- Chainlink CCIP SDK

### Backend
- Bun Runtime
- Hono.js (API framework)
- PostgreSQL (Multi-tenant data)
- Drizzle ORM
- Viem (Ethereum interactions)
- Google Gemini AI

### Frontend
- Next.js 14 (App Router)
- React 18
- TypeScript
- RainbowKit (Wallet connection)
- wagmi (Ethereum hooks)
- TailwindCSS + shadcn/ui

### Infrastructure
- Chainlink CRE Network
- Chainlink CCIP
- Docker Compose
- WebSocket (Real-time updates)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Bun 1.0+
- Foundry
- PostgreSQL 14+
- Chainlink CRE CLI

### Installation

```bash
# Clone repository
git clone https://github.com/[your-username]/sentineldao.git
cd sentineldao

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Set up database
docker-compose up -d postgres
cd apps/api
bunx drizzle-kit push

# Deploy contracts (testnets)
cd packages/contracts
forge build
forge script script/DeployVault.s.sol --rpc-url sepolia --broadcast
forge script script/DeployCCIPSender.s.sol --rpc-url sepolia --broadcast
forge script script/DeployCCIPReceiver.s.sol --rpc-url arbitrum-sepolia --broadcast
forge script script/DeployCCIPReceiver.s.sol --rpc-url base-sepolia --broadcast

# Deploy CRE workflow
cd packages/cre-workflows/sentinel-defense
cre workflow deploy

# Start backend
cd apps/api
bun run dev

# Start frontend
cd apps/dashboard
npm run dev
```

### Configuration

**Environment Variables:**

```env
# Blockchain
CRE_ETH_PRIVATE_KEY=your_private_key
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your_key
ARBITRUM_SEPOLIA_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/your_key
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/your_key

# Chainlink
CCIP_SENDER_ADDRESS=0x4126f0B31FB03e650D96a1aA769F2f1A5DE16f77
CCIP_RECEIVER_ARBITRUM=0xcdCc7e3d66221c22A7D2c1490120e199568fd11D
CCIP_RECEIVER_BASE=0xcdCc7e3d66221c22A7D2c1490120e199568fd11D

# AI
GEMINI_API_KEY=your_gemini_api_key

# Database
DATABASE_URL=postgresql://sentineldao:password@localhost:5432/sentineldao
```

## 📖 Usage

### 1. Monitor Vaults

Access the dashboard at `http://localhost:3000` and connect your wallet. Add vaults during onboarding or via the Vaults page.

### 2. Simulate Attacks

Use the Attack Simulator (floating button) to test threat detection:
- Large Deposit (Whale Alert)
- Rapid Transactions (Flash Drain)
- Flash Loan Attack
- TVL Drain
- Unauthorized Pause

### 3. View Threats

Navigate to the Threats page to see detected threats with AI analysis and severity scores.

### 4. Cross-Chain Defense

When a high-severity threat is detected, the system automatically:
1. Pauses the affected vault
2. Sends CCIP messages to all chains
3. Pauses vaults on Arbitrum and Base
4. Displays CCIP message IDs and transaction hashes

## 🧪 Testing CRE Workflow

### Simulate Locally

```bash
cd packages/cre-workflows/sentinel-defense
cre workflow simulate --broadcast
```

### Trigger Events

```bash
# Deposit to vault (triggers CRE)
cast send $VAULT_ADDRESS "deposit()" --value 0.5ether --rpc-url sepolia --private-key $PRIVATE_KEY

# Check webhook received
curl http://localhost:3001/api/webhooks/cre
```

## 📊 Project Structure

```
sentineldao/
├── packages/
│   ├── contracts/              # Solidity smart contracts
│   │   ├── src/
│   │   │   ├── ProtectedVault.sol
│   │   │   ├── SentinelCCIPSender.sol
│   │   │   └── SentinelCCIPReceiver.sol
│   │   └── script/             # Deployment scripts
│   └── cre-workflows/          # Chainlink CRE workflows
│       └── sentinel-defense/
│           ├── main.ts         # ⭐ CRE workflow logic
│           └── project.yaml    # Workflow configuration
├── apps/
│   ├── api/                    # Backend API
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── webhooks.ts # ⭐ CRE webhook handler
│   │   │   │   └── vaults.ts   # ⭐ CCIP endpoints
│   │   │   └── services/
│   │   │       ├── threat-engine.ts
│   │   │       └── defense-executor.ts # ⭐ CCIP integration
│   │   └── drizzle/            # Database migrations
│   └── dashboard/              # Frontend dashboard
│       └── src/
│           ├── components/
│           │   └── pages/
│           │       └── vaults.tsx # ⭐ CCIP UI
│           └── lib/
│               └── api.ts      # ⭐ API client
└── docker-compose.yml
```

## 🎬 Demo Video

[📹 Watch 5-minute demo](https://youtu.be/your-video-link)


## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 📞 Contact

**Krishna Mahato**
- Email: krishnamahato.of@gmail.com
- GitHub: [@krishna9304](https://github.com/krishna9304)

---

Built with ❤️ by Krishna Mahato
