import { onchainConfig } from "../config/index.js";
import { sha256Hex } from "../helpers/hash.js";
import { getOnchainClient } from "../helpers/onchain.js";
import { stableStringify } from "../helpers/json.js";

export async function issue(req, res) {
	try {
		const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
		const vc = body.vc || body;
		const metadataRaw = body.metadata || {};

		const vcString = stableStringify(vc);
		const credentialHashHex = sha256Hex(vcString);
		const credentialHash = "0x" + credentialHashHex;

		const metadataString =
			typeof metadataRaw === "string"
				? metadataRaw
				: stableStringify(metadataRaw);

		const { registry } = getOnchainClient(onchainConfig);
		const tx = await registry.storeCredential(credentialHash, metadataString);
		const receipt = await tx.wait();

		const contractMetadata = await registry.metadataOf(credentialHash);
		const contractExists =
			typeof registry.exists === "function"
				? await registry.exists(credentialHash)
				: Boolean(contractMetadata && contractMetadata.length > 0);

		console.info("Credential stored", {
			credentialHash,
			hashInput: vcString,
			metadataString,
			txHash: receipt.transactionHash,
			contractExists,
			contractMetadata,
		});

		return res.status(201).json({
			ok: true,
			txHash: receipt.transactionHash,
			credentialHash,
			hashInput: vcString,
			metadata: metadataRaw,
			metadataString,
			contractExists,
			contractMetadata,
		});
	} catch (err) {
		console.error("/issue error", err?.response?.data || err);
		return res
			.status(400)
			.json({ ok: false, error: String(err?.message || err) });
	}
}

export async function issueHealth(req, res) {
	try {
		const { wallet } = getOnchainClient(onchainConfig);
		const addr = await wallet.getAddress();
		res.json({
			ok: true,
			registry: onchainConfig.registryAddress,
			issuer: addr,
			rpc: onchainConfig.rpcUrl,
		});
	} catch (e) {
		res.status(500).json({ ok: false, error: String(e?.message || e) });
	}
}
