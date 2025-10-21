import axios from "axios";
import { appConfig } from "../config/index.js";

const topics = [];

export async function verify(req, res) {
	const message = req.body ?? "";
	console.info("received topic message", { topic: message });

	if (topics.length >= appConfig.topicsSize) {
		topics.shift();
	}

	const messageParse = JSON.parse(message);

	if (messageParse.type.includes("succeeded")) {
		try {
			const response = await axios.get(appConfig.door0Url);
			console.log(response.data);
			console.log("Verificado, se abriran las puertas.....");
		} catch (error) {
			console.error("Door0 request failed", error);
		}
	} else {
		console.log("No verificado, no se abriran las puertas.....");
	}

	topics.push(message);
	res.sendStatus(204);
}

export function checkTopics(req, res) {
	if (topics.length === 0) {
		setTimeout(() => {
			if (topics.length === 0) {
				res.status(404).json({ error: "no topic found in queue" });
			} else {
				res.send(topics.shift());
			}
		}, appConfig.topicTimeoutMs);
		return;
	}

	res.send(topics.shift());
}
