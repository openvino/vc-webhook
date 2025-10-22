export const REGISTRY_ABI = [
	"event CredentialStored(bytes32 indexed credentialHash, string metadata, string subjectDid, string issuerName, string issuerDid)",
	"event CredentialStatusChanged(bytes32 indexed credentialHash, bool active)",
	"function storeCredential(bytes32 credentialHash, string metadata, string subjectDid, string issuerName, string issuerDid) external",
	"function setCredentialStatus(bytes32 credentialHash, bool active) external",
	"function getCredential(bytes32 credentialHash) view returns (string metadata, string subjectDid, string issuerName, string issuerDid, bool active)",
	"function exists(bytes32 credentialHash) view returns (bool)",
	"function isActive(bytes32 credentialHash) view returns (bool)",
	"function getCredentialHashesBySubject(string subjectDid) view returns (bytes32[])",
	"function hasActiveCredential(string subjectDid) view returns (bool)",
	"function getActiveCredentialHash(string subjectDid) view returns (bytes32)",
];
