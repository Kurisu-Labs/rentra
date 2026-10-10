export const handoverTypes = {
  Handover: [
    { name: "rentalId", type: "uint256" },
    { name: "photoHash", type: "bytes32" },
    { name: "timestamp", type: "uint64" },
    { name: "mediator", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export const returnTypes = {
  Return: [
    { name: "rentalId", type: "uint256" },
    { name: "photoHash", type: "bytes32" },
    { name: "timestamp", type: "uint64" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
