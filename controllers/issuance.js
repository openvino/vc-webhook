import { onchainConfig } from "../config/index.js";
import { sha256Hex } from "../helpers/hash.js";
import { getOnchainClient } from "../config/onchain.js";

function resolveCredential(payload) {
	if (!payload) return null;
	if (payload.vc) return payload.vc;
	if (payload.credential) return payload.credential;
	if (payload.data?.credential) return payload.data.credential;
	if (
		Array.isArray(payload.data?.credentials) &&
		payload.data.credentials.length
	) {
		return payload.data.credentials[0];
	}
	return null;
}

function extractIssuer(payload, credential) {
	const issuerRaw =
		credential?.issuer ??
		payload?.issuer ??
		payload?.data?.issuer ??
		payload?.data?.profileID ??
		null;

	if (typeof issuerRaw === "string") {
		return issuerRaw;
	}

	if (issuerRaw && typeof issuerRaw === "object") {
		return issuerRaw.id || issuerRaw.name || null;
	}

	return null;
}

function toMetadataObject(input) {
	if (!input) return {};

	if (typeof input === "string") {
		try {
			const parsed = JSON.parse(input);
			return parsed && typeof parsed === "object"
				? { ...parsed }
				: { rawMetadata: input };
		} catch (_) {
			return { rawMetadata: input };
		}
	}

	if (typeof input === "object" && !Array.isArray(input)) {
		return { ...input };
	}

	return { rawMetadata: input };
}

function ensureMetadataField(metadata, key, value) {
	if (
		value === undefined ||
		value === null ||
		(value && typeof value === "string" && value.trim() === "")
	) {
		return;
	}
	if (metadata[key] === undefined) {
		metadata[key] = value;
	}
}

function safePretty(obj) {
	try {
		return JSON.stringify(obj, null, 2);
	} catch {
		return String(obj);
	}
}

export async function issue(req, res) {
	try {
		const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

		const isSucceeded = body?.type === "issuer.oidc-interaction-succeeded.v1";
		const isAck = body?.type === "issuer.oidc-interaction-ack-succeeded.v1";

		console.info("Raw issuance payload", {
			type: body?.type,
			txnid: body?.txnid,
			hasData: Boolean(body?.data),
			dataKeys: body?.data ? Object.keys(body.data) : [],
			credentialsLen: Array.isArray(body?.data?.credentials)
				? body.data.credentials.length
				: 0,
		});
		const rawDump = safePretty(body);
		console.info("Raw body =\n" + rawDump);
		if (
			Array.isArray(body?.data?.credentials) &&
			body.data.credentials.length > 0
		) {
			const c0 = body.data.credentials[0];
			console.info("credentials[0] snapshot", {
				keys: Object.keys(c0 || {}),
				issuerID: c0?.issuerID,
				subjectID: c0?.subjectID,
				types: c0?.types,
			});
		}

		if (body && body.specversion && body.type) {
			let eventDescription = "Unrecognized event";
			switch (body.type) {
				case "issuer.oidc-interaction-initiated.v1":
					eventDescription = "Issuer initiated issuance (offer created)";
					break;
				case "issuer.oidc-interaction-qr-scanned.v1":
					eventDescription = "Wallet scanned QR / offer opened";
					break;
				case "issuer.oidc-interaction-succeeded.v1":
					eventDescription = "Credential issuance succeeded (ready to send)";
					break;
				case "issuer.oidc-interaction-ack-succeeded.v1":
					eventDescription = "Wallet acknowledged credential (saved)";
					break;
			}
			console.info(`CloudEvent received: ${eventDescription}`, {
				type: body.type,
				time: body.time,
				txnid: body.txnid,
				source: body.source,
			});

			if (!isSucceeded && !isAck) {
				console.info(`Skipping on-chain storage for event: ${body.type}`);
				return res.status(202).json({
					ok: true,
					skipped: true,
					reason: body.type,
					description: eventDescription,
				});
			}
		}

		let vc = body.vc || body;
		let credential = resolveCredential(body) || vc;

		const issuer = extractIssuer(body, credential);

		const metadataObj = toMetadataObject(body.metadata);
		ensureMetadataField(metadataObj, "txnid", body.txnid);
		ensureMetadataField(metadataObj, "type", body.type);
		ensureMetadataField(metadataObj, "time", body.time);
		ensureMetadataField(metadataObj, "issuer", issuer);

		const credentialId =
			credential?.id ||
			(Array.isArray(body?.data?.credentialIDs)
				? body.data.credentialIDs[0]
				: body?.data?.credentialIDs);
		ensureMetadataField(metadataObj, "credentialId", credentialId);

		let hashInput = JSON.stringify(body);

		const credentialHashHex = sha256Hex(hashInput);
		const credentialHash = "0x" + credentialHashHex;

		const metadataString = JSON.stringify(metadataObj);

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
			hashInput,
			metadataString,
			txHash: receipt.transactionHash,
			contractExists,
			contractMetadata,
		});

		return res.status(201).json({
			ok: true,
			txHash: receipt.transactionHash,
			credentialHash,
			hashInput,
			metadata: metadataObj,
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
