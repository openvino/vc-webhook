import axios from "axios";
import { appConfig } from "../config/index.js";

function describeVerifierEvent(type) {
	switch (type) {
		case "verifier.oidc-interaction-initiated.v1":
			return "Verification initiated (request created)";
		case "verifier.oidc-interaction-qr-scanned.v1":
			return "Wallet opened verification request (QR scanned)";
		case "verifier.oidc-interaction-succeeded.v1":
			return "Verification succeeded (presentation satisfied)";
		case "verifier.oidc-interaction-failed.v1":
			return "Verification failed";
		default:
			return "Verification event";
	}
}

function isVerificationSucceeded(evt) {
	return evt?.type === "verifier.oidc-interaction-succeeded.v1";
}

export async function verify(req, res) {
	try {
		const message = req.body ?? "";
		console.info("received topic message", { topic: message });

		let event;
		try {
			event = typeof message === "string" ? JSON.parse(message) : message;
		} catch (e) {
			console.error("verify: invalid JSON payload", e);
			return res.status(400).json({ ok: false, error: "invalid JSON" });
		}

		const type = event?.type || "";
		const description = describeVerifierEvent(type);
		console.info(`🔎 Verifier event: ${description}`, {
			type,
			time: event?.time,
			txnid: event?.txnid,
			source: event?.source,
		});

		if (!isVerificationSucceeded(event)) {
			// For initiated / qr-scanned / failed, just acknowledge and do not open the door
			console.info("Skipping door action (not a successful verification)");
			return res.sendStatus(202);
		}

		// Successful verification → open the door
		try {
			const response = await axios.get(appConfig.door0Url);
			console.log("Door 0 opened");
			console.log(response.data);
			console.log("Verificado, se abriran las puertas.....");
			return res.sendStatus(204);
		} catch (error) {
			console.error("Door0 request failed", error);
			return res.status(502).json({ ok: false, error: "door action failed" });
		}
	} catch (outerErr) {
		console.error("verify: unexpected error", outerErr);
		return res.status(500).json({ ok: false, error: "internal error" });
	}
}
