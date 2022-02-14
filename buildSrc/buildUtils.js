/**
 * This file contains some utilities used from various build scripts in this directory.
 */
import fs from "fs-extra"
import path from "path"

/** global used by the measure() function to mark the start of measurement **/
var measureStartTime

/**
 * Returns tutanota app version (as in package.json).
 * @returns {Promise<*>}
 */
export async function getTutanotaAppVersion() {
	const {version} = JSON.parse(await fs.readFile("package.json", "utf8"))
	return version
}

/**
 * Returns the version of electron used by the app (as in package.json).
 * @returns {Promise<string>}
 */
export async function getElectronVersion() {
	const {devDependencies} = JSON.parse(await fs.readFile("package.json", "utf8"))
	const electronVersion = devDependencies.electron
	return electronVersion
}

/**
 * Returns the elapsed time between the last and current call of measure().
 * @returns {number}
 */
export function measure() {
	if (!measureStartTime) {
		measureStartTime = Date.now()
	}
	return (Date.now() - measureStartTime) / 1000
}

/**
 * Returns object containing the file names for all *.deb files that need to be created during the release process.
 * @returns {Promise<{webApp: string, desktop: string, desktopTest: string, dict: string}>}
 */
export async function getDotDebFileNames() {
	const version = await getTutanotaAppVersion()
	const electronVersion = await getElectronVersion()

	const debs = {
		webApp: `tutanota_${version}_amd64.deb`,
		desktop: `tutanota-desktop_${version}_amd64.deb`,
		desktopTest: `tutanota-desktop-test_${version}_amd64.deb`,
		// the dicts are bound to an electron release, so we use that version number.
		dict: `tutanota-desktop-dicts_${electronVersion}_amd64.deb`
	}

	return debs
}

/**
 * Returns the (absolute) path to the default dist directory/prefix.
 * @returns {string}
 */
export function getDefaultDistDirectory() {
	return path.resolve('build/dist')
}

