export function stableStringify(value) {
	return stringifyValue(value);
}

function stringifyValue(value) {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		const items = value.map((item) => stringifyValue(item));
		return `[${items.join(",")}]`;
	}

	const keys = Object.keys(value).sort();
	const entries = keys.map(
		(key) => `${JSON.stringify(key)}:${stringifyValue(value[key])}`
	);
	return `{${entries.join(",")}}`;
}
