export const protectedVaultAbi = [
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawal",
    inputs: [
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "EmergencyPause",
    inputs: [
      { name: "triggeredBy", type: "address", indexed: true },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SentinelUpdated",
    inputs: [
      { name: "oldSentinel", type: "address", indexed: true },
      { name: "newSentinel", type: "address", indexed: true },
    ],
  },
  {
    type: "function",
    name: "getBalance",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "paused",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "sentinel",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "emergencyPause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "unpause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "deposit",
    inputs: [],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const ccipSenderAbi = [
  {
    type: "function",
    name: "sendPauseCommand",
    inputs: [
      { name: "destinationChainSelector", type: "uint64" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "messageId", type: "bytes32" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "estimatePauseFee",
    inputs: [
      { name: "destinationChainSelector", type: "uint64" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "fee", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getLinkBalance",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "CrossChainPauseSent",
    inputs: [
      { name: "messageId", type: "bytes32", indexed: true },
      { name: "destinationChainSelector", type: "uint64", indexed: true },
      { name: "receiver", type: "address", indexed: false },
      { name: "fees", type: "uint256", indexed: false },
    ],
  },
] as const;
