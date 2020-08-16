#!/usr/bin/env node

//    _______   ___        ___             _         __ 
//   / __/ _ | / _ \___   / _ \_______    (_)__ ____/ /_
//  / _// __ |/ // / -_) / ___/ __/ _ \  / / -_) __/ __/
// /_/ /_/ |_/____/\__/ /_/  /_/  \___/_/ /\__/\__/\__/ 
//                                   |___/              
//
//  FADe Project (Frontend) Source code
//  This program is distributed under MIT License.
//  Copyright (C) ldmsys, All rights reserved.

// Load our precious subprojects
const fade_version = "Git Version";
const buffer_server = require('@fade-project/buffer-server');
const deb = require("@fade-project/deb-build");
const child_process = require('child_process');
const os = require("os");
const tmpjs = require('tmp');
const copy = require('recursive-copy');
const rls = require('readline-sync');
const fs = require("fs");
const NodeRSA = require('node-rsa');
const rsa = new NodeRSA({b: 256});
var args = require('minimist')(process.argv.slice(2), {
    alias: {
        h: 'help',
		v: 'verbose',
		o: 'output',
		i: 'input',
		depend: 'dependency',
		'depend-add': 'dependency-add',
		'depend-rm': 'dependency-rm',
		dependancy: 'dependency',
		deb: 'create-deb'
    }
});

main();

function generate_runbin(name, cmdline, type) {
    let str = "#!/bin/bash\n";
    if(type == deb.types.systemd) {
        str += `echo "Use systemctl start ${name} instead."\n`;
    } else if(type == deb.types.isolated) {
        str += `if [ $EUID -ne 0 ]; then
echo "[FADe] To run this script securely, we need sudo privilege."
fi
cd /usr/lib/${name}
exec sudo -H -u ${name} ${cmdline} $*`;
    } else {
        str += `bash -c "cd /usr/lib/${name}"\n`;
        str += `${cmdline} $*\n`;
    }
    return str;
}
function ret_default(key, req_default) {
	console.warn("[FADe] " + key + " not set, defaulting to " + req_default);
	return req_default;
}
function main() {
	if(typeof args["help"] !== "undefined") {
		console.log(help(false));
	}else if(typeof args["init"] !== "undefined") {
		init();
	}else if(typeof args["edit"] !== "undefined") {
		edit();
	}else if(typeof args["create-deb"] !== "undefined") {
		create_deb(args['path'], args['host']);
	}else if(args['_'] == "moo" || typeof args['moo'] !== "undefined") {
		console.error("[FADe] Actually, FADe has Half-cow Powers.");
		console.error("\t\t(__) \n\t\t(oo) \n\t      ---\\/ \n\t\t||   \n\t      --/\\ \n\t\t~~ ");
	}else{
		console.error("[FADe] Invalid or no option given.");
		console.error(help(true));
		process.exit(1);
	}
}
function help(serious_mode) {
	var return_val = "";
	return_val += serious_mode?"":"FADe Project - CLI Edition / "+fade_version+" Help\n";
	return_val += serious_mode?"":"This program is distributed under MIT License.\n";
	return_val += serious_mode?"":"Copyright (C) ldmsys, All rights reserved.\n\n";
	return_val += "--init [parameters]: Initialize your project.\n";
	return_val += "\t--path \"/path/to/dir\": Locate your project.\n";
	return_val += "\t--name test-project: Set your project's name (package manager friendly)\n"
	return_val += "\t--version 0.0.1: Set your project's version\n";
	return_val += "\t--description \"The Test Project\": Set your project's description.\n";
	return_val += "\t--url \"https://example.com/\": Set your project's official website, Default is \"https://example.com\"\n";
	return_val += "\t--priority optional: Set project's priority, Default is optional\n"
	return_val += "\t--architecture all: Set project's destination system, Default is all\n";
	return_val += "\t--depend[ency] nodejs: Set project's dependancies; this parameter can be used multiple times.\n"
	return_val += "\t--cmdline \"node main.js\": Set your project's run command\n";
	return_val += "\t--maintainer-name \"John Doe\": Set maintainer's name\n";
	return_val += "\t--maintainer-email \"john@example.com\": Set maintainer's email address\n";
	return_val += "\t--type [systemd, isolated, normal]: Set project's type. see manual to detail.\n\n"
	return_val += "--edit [parameters]: Edit your project's configuration with --init's parameters. Additional parameters:\n"
	return_val += "\t--postinst-payload: Edit Post-Install Script's payload with your preferred editor.\n"
	return_val += "\t--prerm-payload: Edit Pre-Remove Script's payload with your preferred editor.\n"
	return_val += "\t--input filename: Use file as postinst/prerm payload\n";
	return_val += "\t--depend[ency]: No effect.\n";
	return_val += "\t--depend[ency]-add: Add Dependency to your project; this parameter can be used multiple times.\n";
	return_val += "\t--depend[ency]-rm: Remove Dependency from your project; this parameter can be used multiple times.\n";
	return_val += "--[create-]deb [parameters]: Create .deb to Install your project to Debian-based systems\n";
	return_val += "\t--path \"/path/to/dir\": Locate your project.\n";
	return_val += "\t--o[utput] [/path/to/dir/]output.deb: Change output deb, Default is name_version_arch.deb on project directory.\n";
	return_val += "\t--host: Host binary to network instead of writing to file.\n";
	return_val += "--h[elp]: Show this help message.\n";
	return_val += serious_mode?"":"\n\tMaybe this FADe has Super Cow Powers..?";
	return return_val;
}
function getFadework(path) {
	if(typeof path == "undefined") {
		console.error("[FADe] This function can't be used without --path parameter.");
		process.exit(1);
	}
	if(fs.existsSync(path+"/fadework")) {
		if(fs.existsSync(path+"/fadework/fade-electron.json") || fs.existsSync(path+"/fadework/internal-sh")) {
			console.error("[FADe] Sorry, but FADe Project is reborn from scratch, so it's not compatible with old configuration files.");
			console.error("[FADe] Please do --init.");
			process.exit(1);
		}else{
			console.log("[FADe] Found Legacy FADe Directory, migrating...");
			fs.renameSync(path+"/fadework", path+"/.fadework");
		}
	}
	if(!fs.existsSync(path+'/.fadework')) {
		console.error("[FADe] Do --init first, please.");
		process.exit(1);
	}
	return path + '/.fadework';
}

function create_deb(path, host) {
	var fadework = getFadework(path);
	var dataraw = require(fadework+'/fade.json');
	let { name, version, architecture } = dataraw;
	var data_tar_gz_datadir = deb.set_data_tar_gz_datadir();
	fs.mkdirSync(data_tar_gz_datadir.name+"/usr");
	var promise_copy1 = copy(fadework+"/usr",data_tar_gz_datadir.name+"/usr", {overwrite: true, expand: true, dot: true, junk: false, filter: ['**/*']});
	promise_copy1.then(() => {
		fs.rmdirSync(data_tar_gz_datadir.name+"/usr/lib/"+name, { recursive: true });
		fs.mkdirSync(data_tar_gz_datadir.name+"/usr/lib/"+name, 0755);
		var promise_copy2 = copy(path, data_tar_gz_datadir.name+"/usr/lib/"+name, {overwrite: true, expand: true, dot: true, junk: false, filter: ['**/*']});
		promise_copy2.then(() => {
			deb.build(name, version, dataraw['desc'], dataraw['url'], architecture, dataraw['depends'], dataraw['priority'],
			dataraw['run'], dataraw['maintainer_name'], dataraw['maintainer_email'], dataraw['type'], dataraw['postinst_payload'],
			dataraw['prerm_payload']).then((deb_content) => {
				if(typeof host !== "undefined") {
					var sftpKey;
					if(fs.existsSync(fadework+"/sftp.key")) {
						sftpKey = fs.readFileSync(fadework+"/sftp.key");
					}else{
						rsa.generateKeyPair();
						sftpKey = rsa.exportKey();
						fs.writeFileSync(fadework+"/sftp.key", sftpKey);
					}
					buffer_server.sftp_server(sftpKey, "fade", "fade-project", name+"_"+version+"_"+architecture+".deb", deb_content, true).then((sftpPort) => {
						console.log(`[FADe] SFTP Server is Listening on ${sftpPort} Port.
[FADe] To get your package from SFTP, please enter on destination system:
[FADe] $ sftp -P ${sftpPort} fade@this-machine-ip
[FADe] Password: fade-project
[FADe] SFTP> get ${name}_${version}_${architecture}.deb`);
						var webindex = `<!DOCTYPE html>
<head>
	<title>FADe Binary download</title>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
	<h1>FADe Binary Download</h1>
	<p>Welcome to FADe binary Download page.</p>
	<a href="/${name}_${version}_${architecture}.deb">Click here to Download binary via HTTP.</a>
	<p>OR Download via SFTP: </p>
	<pre>
$ sftp -P ${sftpPort} fade@this-server-ip
Password: fade-project
SFTP> get ${name}_${version}_${architecture}.deb
	</pre>
	<div style="font-size: 0.4rem; color: grey">
		Due to ssh2 module restrictions, please note that GUI client won't work.<br>
		Generated by <a href="//github.com/fade-project/fade">FADe Project</a> under MIT License with <3 
	</div>
</body>

<!-- cURL Friendly Abstract - to download binary:
	$ curl -O this-server-ip/${name}_${version}_${architecture}.deb
-->`;
						var webPort = buffer_server.web_server(webindex, name+"_"+version+"_"+architecture+".deb", deb_content, true);
						console.log(`[FADe] Web Server Listening at http://localhost:${webPort}`);
					});
					} else {
						var output = typeof args['output'] !== "undefined" ? args['output'] : ret_default("output", path+"/"+name+"_"+version+"_"+architecture+".deb");
						fs.writeFileSync(output, deb_content);
						console.log("[FADe] "+output+" Created. Install on your system!");
					}
			});
		}).catch((err) => {
			console.error("[FADe] Create .deb Failed.");
			console.error(err);
			process.exit(1);
		});
	}).catch((err) => {
		console.error("[FADe] Create .deb Failed.");
		console.error(err);
		process.exit(1);
	});
}

function open_editor(filename, filedata) {
	if(process.env.EDITOR == undefined) {
		if(process.platform == "win32") {
			var release_array = os.release().split(".");
			if(release_array[0] == "10" && release_array[2] >= 17763) { // >= Windows 10 1809
				console.warn("[FADe] %EDITOR% not set, defaulting to notepad.exe");
				process.env.EDITOR = "notepad.exe"
			}else{
				console.error(`[FADe] %EDITOR% not set and Your notepad.exe dosen't support LF Ending.
Please download your preferred editor from the Internet. We recommend vim or nano
 - Vim: https://www.vim.org/download.php#pc
 - Nano: https://www.nano-editor.org/dist/win32-support/
 
Put downloaded binary into C:\\Windows\\system32 or your working directory, and Please type before run FADe:
> set EDITOR=(binary).exe`);
				process.exit(9009);
			}
		}else{
				console.warn("[FADe] $EDITOR not set, defaulting to vi");
				process.env.EDITOR = "vi"
		}
	}
	var tmpfile = tmpjs.tmpNameSync();
	console.log('[FADe] Opening '+filename+' with $EDITOR.');
	fs.writeFileSync(tmpfile, filedata);
	child_process.spawnSync(process.env.EDITOR, [tmpfile], { stdio: 'inherit', detached: true});
	var return_val = fs.readFileSync(tmpfile).toString();
	fs.unlinkSync(tmpfile);
	return return_val;
}

function edit() {
	var path = args['path'];
	var fadework = getFadework(path);
	var dataraw = require(fadework+'/fade.json');
	if(typeof args["name"] !== "undefined") dataraw['name'] = args['name'];
	if(typeof args["description"] !== "undefined") dataraw['desc'] = args['description'];
	if(typeof args["version"] !== "undefined") dataraw['version'] = args['version'];
	if(typeof args["url"] !== "undefined") dataraw['url'] = args['url'];
	if(typeof args["architecture"] !== "undefined") dataraw['architecture'] = args['architecture'];
	if(typeof args["priority"] !== "undefined") dataraw['priority'] = args['priority'];
	if(typeof args["cmdline"] !== "undefined") dataraw['run'] = args['cmdline'];
	if(typeof args["maintainer-name"] !== "undefined") dataraw['maintainer_name'] = args['maintainer-name'];
	if(typeof args["maintainer-email"] !== "undefined") dataraw['maintainer_email'] = args['maintainer-email'];
	if(typeof args["type"] !== "undefined") dataraw['type'] = args['type'];
	/* Dependency Configuration here */
	if(typeof args['dependency-add'] !== "undefined") {
		depArray = dataraw['depends'].split(", ");
		depAdd = args['dependency-add'];
		if(Array.isArray(depAdd)) {
			depAdd.forEach((item, index) => {
				depArray.push(item);
			});
		}else{
			depArray.push(depAdd);
		}
		dataraw['depends'] = "";
		depArray.forEach((item, index) => {
			dataraw['depends'] += (index != 0)?", ":"";
			dataraw['depends'] += item;
		});
	}
	if(typeof args['dependency-rm'] !== "undefined") {
		depArray = dataraw['depends'].split(", ");
		depRm = args['dependency-rm'];
		if(Array.isArray(depRm)) {
			depArray = depArray.filter((val, index, arr) => {
				return !depRm.includes(val);
			});
		}else{
			depArray = depArray.filter((val, index, arr) => {
				return val != depRm;
			});
		}
		dataraw['depends'] = "";
		depArray.forEach((item, index) => {
			dataraw['depends'] += (index != 0)?", ":"";
			dataraw['depends'] += item;
		});
	}
	if(typeof args["postinst-payload"] !== "undefined") {
		if(typeof args["input"] !== "undefined") {
			dataraw['postinst_payload'] = fs.readFileSync(args['input']).toString();
		}else{
			dataraw['postinst_payload'] = open_editor('postinst', dataraw['postinst_payload']);
		}
	}
	if(typeof args["prerm-payload"] !== "undefined") {
		if(typeof args["input"] !== "undefined") {
			dataraw['prerm_payload'] = fs.readFileSync(args['input']).toString();
		}else{
			dataraw['prerm_payload'] = open_editor('prerm', dataraw['prerm_payload']);
		}
	}

	var data = JSON.stringify(dataraw, null, 2);
	fs.writeFileSync(fadework+'/fade.json', data);
	console.log("[FADe] Your amendments were reflected.");
}

function init() {
	//var test = (typeof args["test"] !== "undefined") ? args['test'] : rls.question("What is Test?");
	var path            = (typeof args["path"] !== "undefined")            ? args['path']            : rls.question("[FADe] Locate your project's dir: ");
	var name            = (typeof args["name"] !== "undefined")            ? args['name']            : rls.question("[FADe] Enter your project's name: ");
	var version         = (typeof args["version"] !== "undefined")         ? args['version']         : rls.question("[FADe] Enter your project's version: ");
	var description     = (typeof args["description"] !== "undefined")     ? args['description']     : rls.question("[FADe] Enter your project's description: ");
	var url             = (typeof args["url"] !== "undefined")             ? args['url']             : ret_default("url", "https://example.com/");
	var architecture    = (typeof args["architecture"] !== "undefined")    ? args['architecture']    : ret_default("architecture", "all");
	var dependency_raw  = (typeof args["dependency"] !== "undefined")      ? args['dependency']      : ret_default("dependency", "ask");
		var dependency = "";
		if (dependency_raw == "ask") {
			dependency = rls.question("[FADe] Enter your project's dependency(seperated by comma): ");
		}else if(Array.isArray(dependency_raw)) {
			dependency_raw.forEach((item, index) => {
				dependency += (index != 0)?", ":"";
				dependency += item;
			});
		}else{
			dependency = dependency_raw;
		}
	var priority        = (typeof args["priority"] !== "undefined")        ? args['priority']        : ret_default("priority", "optional");
	var cmdline         = (typeof args["cmdline"] !== "undefined")         ? args['cmdline']         : rls.question("[FADe] Enter your project's cmdline: ");
	var maintainer_name = (typeof args["maintainer-name"] !== "undefined") ? args['maintainer-name'] : rls.question("[FADe] Enter maintainer's name: ");
	var maintainer_email= (typeof args["maintainer-email"] !== "undefined")? args['maintainer-email']: rls.question("[FADe] Enter maintainer's email: ");
	var type            = (typeof args["type"] !== "undefined")            ? args['type']            : rls.question("[FADe] Select type (systemd, isolated, normal): ")
	var fadework        = path + '/.fadework';
	var postinst_payload=`
## You may delete this line, but if you love FADe, please don't remove it.
echo "Powered by Fully Automated Distribution enhanced (FADe)"

## Insert your post-install script here.
## If you need run as your user (if you're using systemd or isolated type) please use:
## sudo -H -u (PROJECT NAME) (COMMAND)

`;
	var prerm_payload   =`
## Insert your pre-remove script here.
## If you need run as your user (if you're using systemd or isolated type) please use:
## sudo -H -u (PROJECT NAME) (COMMAND)

`;

	var data = JSON.stringify({
        name: name,
		version: version,
		desc: description,
		url: url,
		architecture: architecture,
		depends: dependency,
		priority: priority,
		run: cmdline,
		maintainer_name: maintainer_name,
		maintainer_email: maintainer_email,
		type: type,
		postinst_payload: postinst_payload,
		prerm_payload: prerm_payload
	}, null, 2);
	if (fs.existsSync(path+"/fadework")) {
		fs.rmdirSync(path+"/fadework", { recursive: true });
	}
	if (fs.existsSync(fadework)) {
		fs.rmdirSync(fadework, { recursive: true });
	}
	if (!fs.existsSync(fadework)) {
		fs.mkdirSync(fadework, 0755);
	}
	fs.mkdirSync(fadework+'/usr', 0755);
	fs.mkdirSync(fadework+'/usr/bin', 0755);
	fs.mkdirSync(fadework+'/usr/lib', 0755);
	fs.mkdirSync(fadework+'/usr/lib/'+name, 0755);
	fs.writeFileSync(fadework+'/usr/lib/'+name+"/DO_NOT_PUT_FILE_ON_THIS_DIRECTORY", "ANYTHING IN THIS DIRECTORY IS WILL BE DISCARDED");
	fs.writeFileSync(fadework+'/fade.json', data);
	fs.writeFileSync(fadework+"/usr/bin/"+name, generate_runbin(name, cmdline, type));
	fs.chmodSync(fadework+"/usr/bin/"+name,0755);
	console.log(`
[FADe] Structure is successfully created.
[FADe] Please refer manual and --help to next process. 
[FADe] To edit your prerm and postinst payload, Please run:
[FADe] --edit [--postinst-payload] [--prerm-payload]
[FADe] Thanks for using FADe Project.
	`);
}
