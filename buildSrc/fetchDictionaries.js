/**
 * Utility to download/update the dictionaries used for translations within the app.
 */
import path from "path"
import glob from "glob"
import {fetchDictionaries} from "./DictionaryFetcher.js"
import {getDefaultDistDirectory, getElectronVersion} from "./buildUtils.js"
import options from "commander"

options
	.usage('[options]')
	.description('Utility to update the app dictionaries')
	.option('--out-dir <outDir>', "Base dir of client build")
	.option('--deb', "Fetch dictionaries for .deb packaging")
	.parse(process.argv)

const outDir = typeof options.outDir !== 'undefined' ? options.outDir : getDefaultDistDirectory()
const deb = typeof options.deb !== 'undefined' ? options.deb : false

getDictionaries(outDir, deb)
	.then(v => {
		console.log("Dictionaries updated successfully")
		process.exit()
	})
	.catch(e => {
			console.log("Fetching dictionaries failed: ", e)
			process.exit(1)
		}
	)

async function getDictionaries(outDir, deb) {
	const electronVersion = await getElectronVersion()
	const baseTarget = path.join((outDir), '..')

	const targets = deb
		? [baseTarget]
		: glob.sync(path.join(baseTarget, 'desktop*'))
	const targetPaths = targets.map(d => path.join(d, "dictionaries"))
	return fetchDictionaries(electronVersion, targetPaths)
}