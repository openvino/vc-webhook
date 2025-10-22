import { onchainConfig } from "../config/index.js";
import { sha256Hex } from "../helpers/hash.js";
import { getOnchainClient } from "../config/onchain.js";

const pendingIssuances = new Map();
let lastKnownTxnid = null;
let lastSubjectDidInfo = { txnid: null, did: null };

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

function normalizeDid(value) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith("DID:")) {
		return trimmed.slice(4).trim();
	}
	return trimmed;
}

function extractSubjectDid(payload, credential) {
	const collected = [];

	const push = (value) => {
		const normalized = normalizeDid(value);
		if (normalized) {
			collected.push(normalized);
		}
	};

	const inspectCredential = (cred) => {
		if (!cred) return;
		push(cred.subjectID);
		push(cred.subjectId);
		push(cred.subjectDid);
		push(cred.subjectDID);
		push(cred.subject);

		const subject = cred.credentialSubject ?? cred.subject;
		if (subject && typeof subject === "object") {
			if (Array.isArray(subject)) {
				for (const entry of subject) {
					if (entry && typeof entry === "object") {
						push(entry.id);
						push(entry.identifier);
					}
				}
			} else {
				push(subject.id);
				push(subject.identifier);
				push(subject.subjectID);
			}
		}
	};

	inspectCredential(credential);
	inspectCredential(payload?.credential);
	inspectCredential(payload?.vc);

	push(payload?.did);
	push(payload?.subjectID);
	push(payload?.subjectDid);
	push(payload?.data?.subjectID);
	push(payload?.data?.subjectDid);
	push(payload?.data?.subject);

	if (Array.isArray(payload?.data?.credentials)) {
		for (const cred of payload.data.credentials) {
			inspectCredential(cred);
		}
	}

	return collected.length > 0 ? collected[0] : null;
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

function extractIssuerDid(payload, credential) {
	const collected = [];

	const push = (value) => {
		const normalized = normalizeDid(value);
		if (normalized) {
			collected.push(normalized);
		}
	};

	const inspectIssuerObject = (issuerObj) => {
		if (!issuerObj || typeof issuerObj !== "object") return;
		push(issuerObj.id);
		push(issuerObj.did);
		push(issuerObj.DID);
		push(issuerObj.issuerDid);
		push(issuerObj.issuerDID);
	};

	push(credential?.issuerDid);
	push(credential?.issuerDID);
	push(credential?.issuer?.did);
	push(credential?.issuer?.DID);
	push(credential?.issuerId);
	push(credential?.issuerID);

	inspectIssuerObject(credential?.issuer);

	push(payload?.issuerDid);
	push(payload?.issuerDID);
	push(payload?.issuerId);
	push(payload?.issuerID);
	push(payload?.data?.issuerDid);
	push(payload?.data?.issuerDID);
	push(payload?.data?.issuerId);
	push(payload?.data?.issuerID);

	inspectIssuerObject(payload?.issuer);
	inspectIssuerObject(payload?.data?.issuer);

	return collected.length > 0 ? collected[0] : null;
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

function getOrCreatePendingEntry(txnid) {
	if (!txnid) return null;
	const existing = pendingIssuances.get(txnid);
	if (existing) {
		return existing;
	}
	const created = {};
	pendingIssuances.set(txnid, created);
	return created;
}

export async function issue(req, res) {
	try {
		const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

		const eventType = body?.type || null;
		let effectiveTxnid = body?.txnid || null;
		if (effectiveTxnid) {
			lastKnownTxnid = effectiveTxnid;
		}

		const isSucceeded = eventType === "issuer.oidc-interaction-succeeded.v1";
		const isAck = eventType === "issuer.oidc-interaction-ack-succeeded.v1";
		const walletDidFromPayload = normalizeDid(body?.did);
		const didEventDetected = Boolean(walletDidFromPayload);

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
		}

		if (isSucceeded) {
			if (effectiveTxnid) {
				const entry = getOrCreatePendingEntry(effectiveTxnid);
				entry.succeededBody = body;
			}
			console.info(
				"Credential issuance succeeded; deferring on-chain storage until wallet confirms",
				{ txnid: effectiveTxnid }
			);
			return res.status(202).json({
				ok: true,
				skipped: true,
				reason: "awaiting-wallet-save",
			});
		}

		let pendingEntry =
			effectiveTxnid && pendingIssuances.has(effectiveTxnid)
				? pendingIssuances.get(effectiveTxnid)
				: null;

		if (!pendingEntry && !effectiveTxnid && lastKnownTxnid) {
			effectiveTxnid = lastKnownTxnid;
			pendingEntry = pendingIssuances.get(effectiveTxnid) || null;
		}

		if (isAck && effectiveTxnid) {
			const entry = getOrCreatePendingEntry(effectiveTxnid);
			entry.ackBody = body;
			entry.ackReceived = true;
			pendingEntry = entry;
		}

		if (walletDidFromPayload) {
			if (!effectiveTxnid && lastKnownTxnid) {
				effectiveTxnid = lastKnownTxnid;
				pendingEntry = pendingIssuances.get(effectiveTxnid) || null;
			}
			if (effectiveTxnid) {
				const entry = getOrCreatePendingEntry(effectiveTxnid);
				entry.subjectDid = walletDidFromPayload;
				pendingEntry = entry;
			}
			lastSubjectDidInfo = {
				txnid: effectiveTxnid ?? null,
				did: walletDidFromPayload,
			};
			console.info("Subject DID detected for credential flow", {
				type: eventType || "wallet.subject-did",
				txnid: effectiveTxnid,
				subjectDid: walletDidFromPayload,
			});
		}

		if (!isAck && !didEventDetected) {
			const skipReason = eventType || "unknown-event";
			console.info(`Skipping on-chain storage for event: ${skipReason}`);
			return res.status(202).json({
				ok: true,
				skipped: true,
				reason: skipReason,
			});
		}

		const effectivePayload = pendingEntry?.succeededBody || body;
		let credential = resolveCredential(effectivePayload);
		if (!credential && pendingEntry?.succeededBody) {
			credential = resolveCredential(pendingEntry.succeededBody);
		}
		if (!credential) {
			credential = resolveCredential(body) || effectivePayload;
		}

		const lastSubjectDidForTxn =
			lastSubjectDidInfo.did &&
			((effectiveTxnid && lastSubjectDidInfo.txnid === effectiveTxnid) ||
				(!effectiveTxnid && !lastSubjectDidInfo.txnid))
				? lastSubjectDidInfo.did
				: null;

		let subjectDid =
			walletDidFromPayload ||
			pendingEntry?.subjectDid ||
			lastSubjectDidForTxn ||
			extractSubjectDid(effectivePayload, credential) ||
			extractSubjectDid(body, credential);

		const ackReceived = Boolean(isAck || pendingEntry?.ackReceived);
		const ackBody = isAck ? body : pendingEntry?.ackBody;

		if (isAck && !subjectDid) {
			console.info(
				"Wallet acknowledgement lacks subject DID; falling back to latest known DID",
				{
					txnid: effectiveTxnid,
				}
			);
		}

		if (!subjectDid) {
			console.info(
				"Subject DID not yet available; deferring on-chain storage",
				{
					txnid: effectiveTxnid,
					type: eventType || "wallet.subject-did",
				}
			);
			return res.status(202).json({
				ok: true,
				skipped: true,
				reason: "missing-subject-did",
			});
		}

		if (!ackReceived) {
			console.info(
				"Subject DID captured; waiting for wallet acknowledgement before storing credential",
				{ txnid: effectiveTxnid }
			);
			return res.status(202).json({
				ok: true,
				skipped: true,
				reason: "awaiting-wallet-ack",
			});
		}

		const issuerName = extractIssuer(effectivePayload, credential);
		const issuerDid =
			extractIssuerDid(effectivePayload, credential) ||
			extractIssuerDid(body, credential);

		const metadataObj = toMetadataObject(
			effectivePayload.metadata ?? body.metadata
		);
		ensureMetadataField(
			metadataObj,
			"txnid",
			effectiveTxnid ?? effectivePayload.txnid ?? body.txnid
		);
		ensureMetadataField(
			metadataObj,
			"type",
			effectivePayload.type ||
				body.type ||
				(didEventDetected ? "wallet.subject-did" : undefined)
		);
		ensureMetadataField(
			metadataObj,
			"time",
			effectivePayload.time || body.time || body.timestamp
		);
		ensureMetadataField(metadataObj, "issuer", issuerName);
		ensureMetadataField(metadataObj, "issuerDid", issuerDid);
		ensureMetadataField(metadataObj, "subjectDid", subjectDid);
		if (didEventDetected && body.timestamp) {
			ensureMetadataField(metadataObj, "walletTimestamp", body.timestamp);
		}
		if (ackBody?.time) {
			ensureMetadataField(metadataObj, "walletAckTime", ackBody.time);
		}
		if (ackBody?.type) {
			ensureMetadataField(metadataObj, "walletAckType", ackBody.type);
		}
		if (eventType || didEventDetected) {
			ensureMetadataField(
				metadataObj,
				"walletEventType",
				eventType || "wallet.subject-did"
			);
		}

		const credentialId =
			credential?.id ||
			(Array.isArray(effectivePayload?.data?.credentialIDs)
				? effectivePayload.data.credentialIDs[0]
				: effectivePayload?.data?.credentialIDs) ||
			(Array.isArray(body?.data?.credentialIDs)
				? body.data.credentialIDs[0]
				: body?.data?.credentialIDs);
		ensureMetadataField(metadataObj, "credentialId", credentialId);

		const hashPayload = pendingEntry?.succeededBody || body;
		const hashInput = JSON.stringify(hashPayload);

		const credentialHashHex = sha256Hex(hashInput);
		const credentialHash = "0x" + credentialHashHex;

		const metadataString = JSON.stringify(metadataObj);

		const { registry } = getOnchainClient(onchainConfig);

		const tx = await registry.storeCredential(
			credentialHash,
			metadataString,
			subjectDid,
			issuerName || "",
			issuerDid || ""
		);
		const receipt = await tx.wait();

		let onchainRecord = null;
		try {
			const [
				storedMetadata,
				storedSubjectDid,
				storedIssuerName,
				storedIssuerDid,
				active,
			] = await registry.getCredential(credentialHash);
			onchainRecord = {
				metadata: storedMetadata,
				subjectDid: storedSubjectDid,
				issuerName: storedIssuerName,
				issuerDid: storedIssuerDid,
				active,
			};
		} catch (onchainReadErr) {
			console.warn("Unable to read credential from registry after storing", {
				error: onchainReadErr?.reason || onchainReadErr?.message || String(onchainReadErr),
			});
		}

		const contractExists =
			typeof registry.exists === "function"
				? await registry.exists(credentialHash)
				: Boolean(onchainRecord);
		const isActive =
			typeof registry.isActive === "function"
				? await registry.isActive(credentialHash)
				: Boolean(onchainRecord?.active);

		console.info("Credential stored", {
			credentialHash,
			hashInput,
			metadataString,
			subjectDid,
			issuerName,
			issuerDid,
			txHash: receipt?.transactionHash,
			contractExists,
			isActive,
			onchainRecord,
		});

		if (effectiveTxnid) {
			pendingIssuances.delete(effectiveTxnid);
			if (lastKnownTxnid === effectiveTxnid) {
				lastKnownTxnid = null;
			}
			if (lastSubjectDidInfo.txnid === effectiveTxnid) {
				lastSubjectDidInfo = { txnid: null, did: null };
			}
		} else if (!effectiveTxnid && lastSubjectDidInfo.txnid === null) {
			lastSubjectDidInfo = { txnid: null, did: null };
		}

		return res.status(201).json({
			ok: true,
			txHash: receipt?.transactionHash,
			credentialHash,
			hashInput,
			metadata: metadataObj,
			metadataString,
			contractExists,
			isActive,
			subjectDid,
			issuerName,
			issuerDid,
			onchainRecord,
		});
	} catch (err) {
		console.error("/issue error", err?.response?.data || err);
		return res
			.status(400)
			.json({ ok: false, error: String(err?.message || err) });
	}
}

export async function updateCredentialStatus(req, res) {
	try {
		const body =
			typeof req.body === "string" ? JSON.parse(req.body) : req.body ?? {};
		const credentialHash = body.credentialHash;
		const active = body.active;

		if (
			typeof credentialHash !== "string" ||
			!credentialHash.trim().startsWith("0x")
		) {
			return res.status(400).json({
				ok: false,
				error: "credentialHash must be a non-empty 0x-prefixed string",
			});
		}

		if (typeof active !== "boolean") {
			return res.status(400).json({
				ok: false,
				error: "active must be a boolean",
			});
		}

		const normalizedHash = credentialHash.trim();
		const { registry } = getOnchainClient(onchainConfig);
		const tx = await registry.setCredentialStatus(normalizedHash, active);
		const receipt = await tx.wait();

		const exists = await registry.exists(normalizedHash);
		const isActive =
			typeof registry.isActive === "function"
				? await registry.isActive(normalizedHash)
				: active;

		console.info("Credential status updated", {
			credentialHash: normalizedHash,
			active: isActive,
			txHash: receipt?.transactionHash,
		});

		return res.status(200).json({
			ok: true,
			txHash: receipt?.transactionHash,
			credentialHash: normalizedHash,
			exists,
			isActive,
		});
	} catch (err) {
		console.error("/issue/status error", err?.response?.data || err);
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
