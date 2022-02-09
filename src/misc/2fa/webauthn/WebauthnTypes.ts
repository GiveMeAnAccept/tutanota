/** @file Types from Credential Management API. */

/** see https://www.iana.org/assignments/cose/cose.xhtml#algorithms */
export const COSEAlgorithmIdentifierNames = Object.freeze({
	ES256: -7,
	ES384: -35,
	ES512: -36,
	EdDSA: -8,
})
// I'm breaking our naming convention with enums here to make type name the same
export type COSEAlgorithmIdentifier = Values<typeof COSEAlgorithmIdentifierNames>
