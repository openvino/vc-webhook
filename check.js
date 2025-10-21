import "dotenv/config";
import { JsonRpcProvider, Contract } from "ethers";
import { REGISTRY_ABI } from "./abi/registry.js";

const [credentialHash] = process.argv.slice(2);

if (!credentialHash) {
	console.error("Uso: node check.js <credentialHash>");
	process.exit(1);
}

const provider = new JsonRpcProvider(
	process.env.RPC_URL,
	Number(process.env.CHAIN_ID)
);

const registry = new Contract(
	process.env.REGISTRY_ADDRESS,
	REGISTRY_ABI,
	provider
);

const metadata = await registry.metadataOf(credentialHash);
const exists = await registry.exists(credentialHash);

console.log({ credentialHash, exists, metadata });
