import type { Abi, Address } from "viem";

export type ContractRead = {
  address?: Address;
  abi?: Abi;
  functionName: string;
  args?: readonly unknown[];
};

export type ChainProbe = {
  read: (request: ContractRead) => Promise<unknown>;
};
