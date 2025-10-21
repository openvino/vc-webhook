export const REGISTRY_ABI = [
	"event CredentialStored(bytes32 indexed credentialHash, string metadata)",
	"function storeCredential(bytes32 credentialHash, string metadata) external",
	"function metadataOf(bytes32) view returns (string)",
	"function exists(bytes32 credentialHash) view returns (bool)",
];
