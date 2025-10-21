import "dotenv/config";

const WEBHOOK_PORT = process.env.WEBHOOK_PORT || 3000;
if (!WEBHOOK_PORT) {
	throw new Error("WEBHOOK_PORT env variable is required");
}

const DOOR0_URL = process.env.DOOR0_URL;

if (!DOOR0_URL) {
	throw new Error("DOOR0_URL env variable is required");
}

const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
const RPC_URL = process.env.RPC_URL;
const CHAIN_ID = Number(process.env.CHAIN_ID);
const PRIVATE_KEY = process.env.PRIVATE_KEY;

export const appConfig = {
	port: Number(WEBHOOK_PORT),
	topicsSize: 5000,
	topicTimeoutMs: 100,
	door0Url: DOOR0_URL,
};

export const onchainConfig = {
	registryAddress: REGISTRY_ADDRESS,
	rpcUrl: RPC_URL,
	chainId: CHAIN_ID,
	privateKey: PRIVATE_KEY,
};
