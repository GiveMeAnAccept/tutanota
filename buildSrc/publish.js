/**
 * This is a script that runs all steps necessary for publishing the finished build artifacts, i.e. signed binaries.
 * The steps performed in here should be moved to the Jenkinsfile. That would be much simpler plus we never want to run this outside of our CI environment.
 */
import {spawnSync} from "child_process"
import options from "commander"
import {getDotDebFileNames, getElectronVersion, getTutanotaAppVersion} from "./buildUtils.js"

options
	.option('--publish-dictionaries', 'Also publish spellcheck dictionaries')
	.parse(process.argv)

const publishDictionaries = typeof options.publishDictionaries != 'undefined' ? options.publishDictionaries : false

packageAndPublish(publishDictionaries)
	.then(v => {
		console.log("Published successfully")
		process.exit()
	})
	.catch(e => {
		console.log("Publishing failed: ", e)
		process.exit(1)
	})

async function packageAndPublish(publishDictionaries) {
	const version = await getTutanotaAppVersion()
	const electronVersion = await getElectronVersion()
	const debs = await getDotDebFileNames(version, electronVersion)

	packageDeb(version, electronVersion, debs, publishDictionaries)
	publish(version, debs, publishDictionaries)
}

function publish(version, debs, publishDictionaries) {
	console.log("Create git tag and copy .deb")
	exitOnFail(spawnSync("/usr/bin/git", `tag -a tutanota-release-${version} -m ''`.split(" "), {
		stdio: [process.stdin, process.stdout, process.stderr]
	}))

	exitOnFail(spawnSync("/usr/bin/git", `push origin tutanota-release-${version}`.split(" "), {
		stdio: [process.stdin, process.stdout, process.stderr]
	}))

	exitOnFail(spawnSync("/bin/cp", `-f build/${debs.webApp} /opt/repository/tutanota/`.split(" "), {
		cwd: __dirname,
		stdio: [process.stdin, process.stdout, process.stderr]
	}))

	exitOnFail(spawnSync("/bin/cp", `-f build/${debs.desktop} /opt/repository/tutanota-desktop/`.split(" "), {
		cwd: __dirname,
		stdio: [process.stdin, process.stdout, process.stderr]
	}))
	exitOnFail(spawnSync("/bin/cp", `-f build/${debs.desktopTest} /opt/repository/tutanota-desktop-test/`.split(" "), {
		cwd: __dirname,
		stdio: [process.stdin, process.stdout, process.stderr]
	}))

	// copy appimage for dev_clients
	exitOnFail(spawnSync("/bin/cp", `-f build/desktop/tutanota-desktop-linux.AppImage /opt/repository/dev_client/tutanota-desktop-linux-new.AppImage`.split(" "), {
		cwd: __dirname,
		stdio: [process.stdin, process.stdout, process.stderr]
	}))

	// user puppet needs to read the deb file from jetty
	exitOnFail(spawnSync("/bin/chmod", `o+r /opt/repository/tutanota/${debs.webApp}`.split(" "), {
		cwd: __dirname + '/build/',
		stdio: [process.stdin, process.stdout, process.stderr]
	}))

	exitOnFail(spawnSync("/bin/chmod", `o+r /opt/repository/tutanota-desktop/${debs.desktop}`.split(" "), {
		cwd: __dirname + '/build/',
		stdio: [process.stdin, process.stdout, process.stderr]
	}))
	exitOnFail(spawnSync("/bin/chmod", `o+r /opt/repository/tutanota-desktop-test/${debs.desktopTest}`.split(" "), {
		cwd: __dirname + '/build/',
		stdio: [process.stdin, process.stdout, process.stderr]
	}))
	// in order to release this new version locally, execute:
	// mv /opt/repository/dev_client/tutanota-desktop-linux-new.AppImage /opt/repository/dev_client/tutanota-desktop-linux.AppImage
	exitOnFail(spawnSync("/bin/chmod", `o+r /opt/repository/dev_client/tutanota-desktop-linux-new.AppImage`.split(" "), {
		cwd: __dirname + '/build/',
		stdio: [process.stdin, process.stdout, process.stderr]
	}))

	// copy spell checker dictionaries.
	if (publishDictionaries) {
		console.log("copying dictionaries")
		exitOnFail(spawnSync("/bin/cp", `-f build/${deb.dict} /opt/repository/tutanota/`.split(" "), {
			cwd: __dirname,
			stdio: [process.stdin, process.stdout, process.stderr]
		}))
		exitOnFail(spawnSync("/bin/chmod", `o+r /opt/repository/tutanota/${deb.dict}`.split(" "), {
			stdio: [process.stdin, process.stdout, process.stderr]
		}))
	}
}

/** The stuff we do here should be moved to the Jenkinsfile **/
function packageDeb(version, electronVersion, debs, publishDictionaries) {
	// overwrite output, source=dir target=deb, set owner
	const commonArgs = `-f -s dir -t deb --deb-user tutadb --deb-group tutadb`

	const target = `/opt/tutanota`
	exitOnFail(spawnSync("/usr/bin/find", `. ( -name *.js -o -name *.html ) -exec gzip -fkv --best {} \;`.split(" "), {
		cwd: __dirname + '/build/dist',
		stdio: [process.stdin, process.stdout, process.stderr]
	}))

	console.log("create " + debs.webApp)
	exitOnFail(spawnSync("/usr/local/bin/fpm", `${commonArgs} --after-install ../resources/scripts/after-install.sh -n tutanota -v ${version} dist/=${target}`.split(" "), {
		cwd: __dirname + '/build',
		stdio: [process.stdin, process.stdout, process.stderr]
	}))

	console.log("create " + debs.desktop)
	exitOnFail(spawnSync("/usr/local/bin/fpm", `${commonArgs} -n tutanota-desktop -v ${version} desktop/=${target}-desktop`.split(" "), {
		cwd: __dirname + '/build',
		stdio: [process.stdin, process.stdout, process.stderr]
	}))

	console.log("create " + debs.desktopTest)
	exitOnFail(spawnSync("/usr/local/bin/fpm", `${commonArgs} -n tutanota-desktop-test -v ${version} desktop-test/=${target}-desktop`.split(" "), {
		cwd: __dirname + '/build',
		stdio: [process.stdin, process.stdout, process.stderr]
	}))

	if (publishDictionaries) {
		console.log("create " + debs.dict)
		exitOnFail(spawnSync("/usr/local/bin/fpm", `${commonArgs} -n tutanota-desktop-dicts -v ${electronVersion} dictionaries/=${target}-desktop/dictionaries`.split(" "), {
			cwd: __dirname + "/build",
			stdio: [process.stdin, process.stdout, process.stderr]
		}))
	}
}

function exitOnFail(result) {
	if (result.status !== 0) {
		throw new Error("error invoking process" + JSON.stringify(result))
	}
}