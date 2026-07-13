import { CommandModule, InferredOptionTypes, Options } from "yargs";
import { existsSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { Address, Cell } from "@ton/core";
import { TonClient4 } from "@ton/ton";
import { UIProvider } from "@ton/blueprint";
import { CommandContext } from "../cli.js";
import { FETCH_CONTRACT_ID, Sym } from "../common/constants.js";
import {
  findTSABocDirectory,
  getRemoteContractDataPath,
  getRemoteContractMetaPath,
  getRemoteContractPath,
} from "../common/paths.js";
import { isInteractiveEnabled } from "./command-utils.js";

const MAINNET_V4_ENDPOINT = "https://mainnet-v4.tonhubapi.com";
const TESTNET_V4_ENDPOINT = "https://testnet-v4.tonhubapi.com";
const MASTERCHAIN_ID = -1;
const CONTRACT_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;

export type FetchNetwork = "mainnet" | "testnet";

/**
 * Metadata stored next to a fetched contract BoC file.
 */
export interface RemoteContractMeta {
  name: string;
  address: string;
  network: FetchNetwork;
  /** Unix timestamp (seconds) the state was requested at, if any */
  timestamp: number | null;
  /** Masterchain block seqno the contract state was taken from */
  masterchainSeqno: number;
  /** Contract balance in nanotons at the fetched state */
  balance: string;
  codeHash: string;
  /** Hash of the contract data cell at the fetched state, if data is present */
  dataHash: string | null;
  fetchedAt: string;
}

const fetchContractCliOptions = {
  address: {
    alias: "a",
    type: "string",
    description: "Address of the contract to fetch",
  },
  name: {
    alias: "n",
    type: "string",
    description:
      "Name to store the fetched contract under (asked interactively when omitted)",
  },
  timestamp: {
    alias: "u",
    type: "string",
    description:
      "Fetch the contract code as of this moment: unix seconds or an ISO-8601 date (default: latest state)",
  },
  network: {
    type: "string",
    choices: ["mainnet", "testnet"],
    description: "Network to fetch the contract from",
  },
  interactive: {
    type: "boolean",
    default: true,
    description: "Enable interactive prompts",
  },
} as const satisfies Record<string, Options>;

type FetchContractSchema = InferredOptionTypes<typeof fetchContractCliOptions>;

export function createFetchContractCommand(
  context: CommandContext,
): CommandModule<object, FetchContractSchema> {
  return {
    command: FETCH_CONTRACT_ID,
    describe:
      "Fetch a deployed contract from the blockchain and store it in tsa/boc for analysis",
    builder: fetchContractCliOptions,
    handler: async (argv: FetchContractSchema) => {
      await fetchContractCommand(context, argv);
    },
  };
}

const parseTimestampToUnixSeconds = (raw: string): number => {
  if (/^\d+$/.test(raw)) {
    return Number.parseInt(raw, 10);
  }

  const parsedMilliseconds = Date.parse(raw);
  if (Number.isNaN(parsedMilliseconds)) {
    throw new Error(
      `Invalid timestamp '${raw}'. Provide unix seconds (e.g. 1719791999) or an ISO-8601 date (e.g. 2024-06-30T23:59:59Z).`,
    );
  }
  return Math.floor(parsedMilliseconds / 1000);
};

const resolveNetwork = async (
  ui: UIProvider,
  parsedNetwork: string | undefined,
  interactive: boolean,
): Promise<FetchNetwork> => {
  if (parsedNetwork === "mainnet" || parsedNetwork === "testnet") {
    return parsedNetwork;
  }
  if (!isInteractiveEnabled(interactive)) {
    throw new Error(
      "Please specify the network with --network mainnet|testnet",
    );
  }
  return ui.choose(
    "Which network to fetch the contract from?",
    ["mainnet", "testnet"] as FetchNetwork[],
    (network) => network,
  );
};

const resolveAddress = async (
  ui: UIProvider,
  parsedAddress: string | undefined,
  interactive: boolean,
): Promise<Address> => {
  if (parsedAddress !== undefined) {
    try {
      return Address.parse(parsedAddress);
    } catch {
      throw new Error(`Invalid contract address: ${parsedAddress}`);
    }
  }
  if (!isInteractiveEnabled(interactive)) {
    throw new Error("Please specify the contract address with --address");
  }
  return ui.inputAddress("Enter the address of the contract to fetch:");
};

const validateContractName = (name: string): string | null => {
  if (name.length === 0) {
    return "Contract name must not be empty.";
  }
  if (!CONTRACT_NAME_PATTERN.test(name)) {
    return "Contract name may only contain letters, digits, '-' and '_'.";
  }
  return null;
};

const resolveContractName = async (
  ui: UIProvider,
  parsedName: string | undefined,
  interactive: boolean,
): Promise<string> => {
  const interactiveEnabled = isInteractiveEnabled(interactive);

  if (parsedName !== undefined) {
    const nameError = validateContractName(parsedName);
    if (nameError !== null) {
      throw new Error(nameError);
    }
    await confirmOverwrite(ui, parsedName, interactiveEnabled);
    return parsedName;
  }

  if (!interactiveEnabled) {
    throw new Error("Please specify the contract name with --name");
  }

  while (true) {
    const name = (await ui.input("Enter a name for the contract:")).trim();
    const nameError = validateContractName(name);
    if (nameError !== null) {
      ui.write(`${Sym.WARN} ${nameError} Please try again.`);
      continue;
    }
    if (existsSync(getRemoteContractPath(name))) {
      const overwrite = await ui.prompt(
        `Contract '${name}' already exists in tsa/boc. Overwrite?`,
      );
      if (!overwrite) {
        continue;
      }
    }
    return name;
  }
};

const confirmOverwrite = async (
  ui: UIProvider,
  name: string,
  interactiveEnabled: boolean,
): Promise<void> => {
  if (!existsSync(getRemoteContractPath(name))) {
    return;
  }
  if (!interactiveEnabled) {
    throw new Error(
      `Contract '${name}' already exists in tsa/boc. Remove it or pick another name.`,
    );
  }
  const overwrite = await ui.prompt(
    `Contract '${name}' already exists in tsa/boc. Overwrite?`,
  );
  if (!overwrite) {
    ui.write(`${Sym.WARN} Fetch was cancelled by the user.`);
    process.exit(0);
  }
};

const resolveMasterchainSeqno = async (
  client: TonClient4,
  timestamp: number | null,
): Promise<number> => {
  if (timestamp === null) {
    const lastBlock = await client.getLastBlock();
    return lastBlock.last.seqno;
  }

  let block;
  try {
    block = await client.getBlockByUtime(timestamp);
  } catch (error) {
    throw new Error(
      `Failed to find a block at timestamp ${timestamp} (${new Date(timestamp * 1000).toISOString()}): ${(error as Error).message}`,
    );
  }

  const masterchainShard = block.shards.find(
    (shard) => shard.workchain === MASTERCHAIN_ID,
  );
  if (masterchainShard === undefined) {
    throw new Error(
      `No masterchain block found at timestamp ${timestamp}. Try a different timestamp.`,
    );
  }
  return masterchainShard.seqno;
};

export const fetchContractCommand = async (
  context: CommandContext,
  parsedArgs: FetchContractSchema,
) => {
  const { ui } = context;
  const interactive = parsedArgs.interactive;

  const network = await resolveNetwork(ui, parsedArgs.network, interactive);
  const address = await resolveAddress(ui, parsedArgs.address, interactive);
  const name = await resolveContractName(ui, parsedArgs.name, interactive);
  const timestamp =
    parsedArgs.timestamp !== undefined
      ? parseTimestampToUnixSeconds(parsedArgs.timestamp)
      : null;

  const endpoint =
    network === "mainnet" ? MAINNET_V4_ENDPOINT : TESTNET_V4_ENDPOINT;
  const client = new TonClient4({ endpoint });

  ui.write(
    `${Sym.WAIT} Fetching contract ${address.toString()} from ${network}` +
      (timestamp !== null
        ? ` at ${new Date(timestamp * 1000).toISOString()}...`
        : " (latest state)..."),
  );

  const masterchainSeqno = await resolveMasterchainSeqno(client, timestamp);
  const account = await client.getAccount(masterchainSeqno, address);

  if (account.account.state.type !== "active") {
    throw new Error(
      `Contract at ${address.toString()} is not active at the requested moment (state: ${account.account.state.type}).`,
    );
  }

  const codeBase64 = account.account.state.code;
  if (codeBase64 === null) {
    throw new Error(
      `Contract at ${address.toString()} has no code at the requested moment.`,
    );
  }

  const codeBuffer = Buffer.from(codeBase64, "base64");
  // Validate that the fetched code is a well-formed BoC
  const codeCell = Cell.fromBoc(codeBuffer)[0];

  findTSABocDirectory();
  const bocPath = getRemoteContractPath(name);
  writeFileSync(bocPath, codeBuffer);

  const dataBase64 = account.account.state.data;
  const dataPath = getRemoteContractDataPath(name);
  let dataHash: string | null = null;
  if (dataBase64 !== null) {
    const dataBuffer = Buffer.from(dataBase64, "base64");
    // Validate that the fetched data is a well-formed BoC
    const dataCell = Cell.fromBoc(dataBuffer)[0];
    dataHash = dataCell.hash().toString("hex");
    writeFileSync(dataPath, dataBuffer);
  } else if (existsSync(dataPath)) {
    // Remove stale data from a previous fetch under the same name
    unlinkSync(dataPath);
  }

  const meta: RemoteContractMeta = {
    name,
    address: address.toString(),
    network,
    timestamp,
    masterchainSeqno,
    balance: account.account.balance.coins,
    codeHash: codeCell.hash().toString("hex"),
    dataHash,
    fetchedAt: new Date().toISOString(),
  };
  writeFileSync(
    getRemoteContractMetaPath(name),
    JSON.stringify(meta, null, 2) + "\n",
  );

  const relativeBocPath = path.relative(process.cwd(), bocPath);
  ui.write(`${Sym.OK} Contract code saved to ${relativeBocPath}`);
  if (dataHash !== null) {
    ui.write(
      `${Sym.OK} Contract data saved to ${path.relative(process.cwd(), dataPath)}`,
    );
  } else {
    ui.write(`${Sym.WARN} Contract has no data at the requested moment.`);
  }
  ui.write(`Code hash: ${meta.codeHash}`);
  ui.write(`Balance: ${meta.balance} nanotons`);
  ui.write("");
  ui.write("You can now analyze it, for example:");
  ui.write(`> yarn blueprint tsa drain-check -c ${name}`);
};
