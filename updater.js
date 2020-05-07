const fs = require("fs");
const data = JSON.parse(fs.readFileSync("orig.json", "utf8"));
const fetch = require("node-fetch");

const mavenCentralPrefix = "https://repo1.maven.org/maven2/";
const newVersion = "3.2.3";
const modifyLinux = "arm32";

const escapeRegExp = string => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string

const mavenToPath = (maven, classifier) => {
	const mavenSplit = maven.split(":");
	const classifierPrefixed = classifier ? ("-" + classifier) : "";
	return mavenSplit[0].replace(/\./g, "/") + "/" + mavenSplit[1] + "/" + mavenSplit[2] + "/" + mavenSplit[1] + "-" + mavenSplit[2] + classifierPrefixed + ".jar";
};

const mavenVersionReplace = maven => {
	const mavenSplit = maven.split(":");
	return mavenSplit[0] + ":" + mavenSplit[1] + ":" + newVersion;
};

const getMavenSize = async (maven, path) => {
	const mavenSplit = maven.split(":");
	const listPageUrl = mavenSplit[0].replace(/\./g, "/") + "/" + mavenSplit[1] + "/" + mavenSplit[2] + "/";
	const listPage = await (await fetch(mavenCentralPrefix + listPageUrl)).text();
	const size = new RegExp(escapeRegExp(path.split("/").pop()) + "<\\/a>\\s*[\\d\\-:]+ [\\d\\-:]+\\s*(\\d+)").exec(listPage)[1];
	return parseInt(size);
};

const getMavenDownload = async (maven, classifier) => {
	const path = mavenToPath(maven, classifier);
	const sha1 = await (await fetch(mavenCentralPrefix + path + ".sha1")).text();
	const size = await getMavenSize(maven, path);
	return {
		sha1,
		size,
		url: mavenCentralPrefix + path
	};
};

console.log(data);

const doParallelUpdate = async () => {
	// Keep it the same as the old version so MMC doesn't get confused
	//data.version = newVersion;
	data.libraries = await Promise.all(data.libraries.map(async lib => {
		// Keep it the same as the old version so MMC doesn't get confused
		let newName = mavenVersionReplace(lib.name);
		if (lib.downloads.artifact) {
			lib.downloads.artifact = await getMavenDownload(newName, "");
		}
		if (lib.downloads.classifiers) {
			await Promise.all(Object.keys(lib.downloads.classifiers).map(async classifier => {
				if (modifyLinux) {
					lib.downloads.classifiers[classifier] = await getMavenDownload(newName, classifier.replace("linux", "linux-" + modifyLinux));
				} else {
					lib.downloads.classifiers[classifier] = await getMavenDownload(newName, classifier);
				}
			}));
		}
		return lib;
	}));
};

doParallelUpdate().then(() => {
	console.log(JSON.stringify(data, null, "\t"));
	fs.writeFileSync("new.json", JSON.stringify(data, null, "\t"));
});