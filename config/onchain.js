import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { REGISTRY_ABI } from "../abi/registry.js";

let cache = null;

export function getOnchainClient({
	registryAddress,
	rpcUrl,
	chainId,
	privateKey,
}) {
	if (!registryAddress || !rpcUrl || !privateKey) {
		throw new Error(
			"Missing on-chain env: REGISTRY_ADDRESS, RPC_URL or PRIVATE_KEY"
		);
	}

	if (cache) {
		return cache;
	}

	const provider = new JsonRpcProvider(rpcUrl, Number(chainId));
	const wallet = new Wallet(privateKey, provider);
	const registry = new Contract(registryAddress, REGISTRY_ABI, wallet);

	cache = { provider, wallet, registry };
	return cache;
}
