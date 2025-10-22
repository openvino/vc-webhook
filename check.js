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

let credentialTuple = null;
let exists = false;
let isActive = false;

try {
	credentialTuple = await registry.getCredential(credentialHash);
	exists = true;
	isActive = credentialTuple[4];
} catch (err) {
	const reason = err?.reason || err?.message || String(err);
	if (!reason.includes("Credential not found")) {
		console.warn("No se pudo leer la credencial:", reason);
	}
	exists = await registry.exists(credentialHash);
	if (exists && typeof registry.isActive === "function") {
		isActive = await registry.isActive(credentialHash);
	}
}

const output = {
	credentialHash,
	exists,
	isActive,
};

if (credentialTuple) {
	const [metadata, subjectDid, issuerName, issuerDid] = credentialTuple;
	output.metadata = metadata;
	output.subjectDid = subjectDid;
	output.issuerName = issuerName;
	output.issuerDid = issuerDid;
}

console.log(output);
