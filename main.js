#!/usr/bin/env node

//    _______   ___        ___             _         __ 
//   / __/ _ | / _ \___   / _ \_______    (_)__ ____/ /_
//  / _// __ |/ // / -_) / ___/ __/ _ \  / / -_) __/ __/
// /_/ /_/ |_/____/\__/ /_/  /_/  \___/_/ /\__/\__/\__/ 
//                                   |___/              
//
//  FADe Project (CLI Edition) Source code
//  This program is distributed under MIT License.
//  Copyright (C) ldmsys, All rights reserved.
//  WARNING: This Source code IS COMPLETELY spaghetti code.

const fade_version = "Git Version";
var rls = require('readline-sync');
var ln = '\n';
var tmpjs = require('tmp');
var child_process = require('child_process');
var os = require("os");
var fs = require("fs");
var rimraf = require("rimraf");
var copy = require('recursive-copy');
var targz = require("targz");
const constants = require('constants');
const crypto = require('crypto');
const ssh2 = require('ssh2');
const express = require('express');
const app = express();
const NodeRSA = require('node-rsa');
const rsa = new NodeRSA({b: 256});
var args = require('minimist')(process.argv.slice(2), {
    alias: {
        h: 'help',
		v: 'verbose',
		o: 'output',
		i: 'input',
		depend: 'dependency',
		dependancy: 'dependency',
		deb: 'create-deb'
    }
});
main();

function generate_ar_header(filename, timestamp, owner_id, group_id, filemode, filesize) {
	// REF: https://en.wikipedia.org/wiki/Ar_%28Unix%29
    var buf = Buffer.alloc(60, 0x20); // fill with space

    buf.write(filename.toString(), 0); // 0 - 16 byte: File Name
    buf.write(timestamp.toString(), 16); // 16 - 28 byte: Timestamp (1972-11-21 = 91152000)
    buf.write(owner_id.toString(), 28); // 28 - 34 byte: Owner ID
    buf.write(group_id.toString(), 34); // 34 - 40 byte: Group ID
    buf.write(filemode.toString(), 40); // 40 - 48 byte: File Mode (WARNING: OCTAL!!)
    buf.write(filesize.toString(), 48); // 48 - 58 byte: File Size
    buf.write('`\n', 58); // 58 - 60 Byte: End of Header
    return buf;
}

function promise_targz_compress(opt) {
    return new Promise((res, rej) => {
        targz.compress(opt, (err) => {
            if(err) return rej(err);
            res();
        });
    });
}

function generate_deb_control(name, version, maintainer_name, maintainer_email, depends, architecture, priority, url, desc) {
    str = "";
    str += "Package: " + name + ln;
    str += "Version: " + version + ln;
    str += "Priority: " + priority + ln;
    str += "Architecture: " + architecture + ln;
    str += "Maintainer: " + maintainer_name + " <" + maintainer_email + ">\n";
    str += "Depends: systemd, " + depends + ln;
    str += "Homepage: " + url + ln;
    str += "Description: " + desc
    str += ln;
    //console.log("Control File: \n"+str);
    return str;
}
function generate_runbin(name, cmdline, type) {
    str = "";
    str += "#!/bin/bash\n";
    if(type == "systemd") {
        str += "echo \"Use systemctl start "+name+" instead.\"\n";
    }
    if(type == "isolated") {
        str += "if [ $EUID -ne 0 ]; then\n";
        str += "echo \"(FADe) To run this script securely, we need sudo privilege.\"\n";
        str += "fi\n"
        str += "cd /usr/lib/" + name + ln;
        str += "exec sudo -H -u " + name + " " + cmdline + " $*\n";
    }
    if(type == "normal") {
        str += "bash -c \"cd /usr/lib/"+name+";"+cmdline+" $*\"\n";
    }
    //console.log("RunBin File: \n"+str);
    return str;
}
function generate_deb_postinst(name, version, desc, cmdline, type, maintainer_name, maintainer_email, postinst) {
    str = "";
    str += "#!/bin/bash\n";
    if(type == "systemd" || type == "isolated") {
        str += "useradd -r -s /dev/null -g nogroup -d /usr/lib/" + name + " -c \"" + desc + "\" " + name + ln;
        str += "chown -R " + name + ":root /usr/lib/" + name + ln;
    }
    str += "echo \"" + name + " v" + version + " by " + maintainer_name + " <" + maintainer_email + ">\"\n";
    str += postinst;
    str += ln;
    if(type == "systemd") {
        str += "cat >> /etc/systemd/system/" + name + ".service << EOF\n";
        /* Start /etc/systemd/system/{NAME}.service Content */
        str += "[Unit]\n";
        str += "Description="+desc+ln;

        str += "[Service]\n";
        str += "Type=simple\n";
        str += "User=" + name + ln;
        str += "WorkingDirectory=/usr/lib/"+name+ln;
        str += "ExecStart=/bin/bash -c \"cd /usr/lib/" + name + ";" + cmdline + "\"\n";
        str += "ExecStop=/usr/bin/killall -u " + name + ln;

        str += "[Install]\n";
        str += "WantedBy=multi-user.target\n";
        /* End /etc/systemd/system/{NAME}.service Content */
        str += "EOF\n";
        str += "chmod 644 /etc/systemd/system/"+name+".service\n";
        str += "systemctl daemon-reload\n";
        str += "systemctl start "+name+ln;
        str += "systemctl enable "+name+ln;
    }
    //console.log("PostInst File: \n"+str);
    return str;
}
function generate_deb_prerm(name, type, prerm) {
    str = "";
    str += "#!/bin/bash\n";
    str += prerm;
    str += ln;
    if(type == "systemd" || type == "isolated") {
        if(type == "systemd") {
            str += "systemctl stop " + name + ln;
            str += "systemctl disable "+ name + ln;
            str += "rm /etc/systemd/system/" + name + ".service\n";
            str += "systemctl daemon-reload\n";
        }
        str += "userdel " + name + ln;
    }
    str += "rm /usr/bin/" + name + ln;
    str += "rm -rf /usr/lib/" + name + "/.*\n";
    str += "rm -rf /usr/lib/" + name + "/*\n";
    //console.log("PreRM File:\n "+str);
    return str;
}
function ret_default(key, req_default) {
	console.warn("[FADe] " + key + " not set, defaulting to " + req_default);
	return req_default;
}
function sftp_server(serverKey, allowedUser, allowedPass, filename, filedata) {
	return new ssh2.Server({
	  hostKeys: [serverKey]
	}, (client) => {
	  client.on("authentication", (ctx) => {
		// Authentication
		if(ctx.method == "password" && ctx.user.length == allowedUser.length && crypto.timingSafeEqual(Buffer.from(ctx.user), Buffer.from(allowedUser))
		&& ctx.password.length == allowedPass.length && crypto.timingSafeEqual(Buffer.from(ctx.password), Buffer.from(allowedPass))) {
		  ctx.accept();
		}else{
		  ctx.reject(['password']);
		}
	  }).on('ready', () => {
		// Ready
		client.on('session', (accept, reject) => {
		  var session = accept();
		  
		  session.on('sftp', (accept, reject) => {
			// SFTP Connection
			var sftpStream = accept();
			var openFiles = {};
			var handleCount = 0;
			function onSTAT(reqid, path) {
			  if (path !== '/'+filename)
				return sftpStream.status(reqid, ssh2.SFTP_STATUS_CODE.FAILURE);
				var mode = constants.S_IFREG; // Regular file
				mode |= constants.S_IRWXU; // read, write, execute for user
				mode |= constants.S_IRWXG; // read, write, execute for group
				mode |= constants.S_IRWXO; // read, write, execute for other
			  sftpStream.attrs(reqid, {
				mode: mode,
				uid: 0,
				gid: 0,
				size: filedata.length,
				atime: Date.now(),
				mtime: Date.now()
			  });
			}
			var hl = (filedata.length+1>256)?256:filedata.length+1;
			sftpStream.on('OPEN', (reqid, reqFilename, flags, attrs) => {
			  if (reqFilename !== '/'+filename || !(flags & ssh2.SFTP_OPEN_MODE.READ))
				return sftpStream.status(reqid, ssh2.SFTP_STATUS_CODE.FAILURE);
			  var handle = Buffer.alloc(hl);
			  openFiles[handleCount] = { read: false };
			  handle.writeUInt32BE(handleCount++, 0, true);
			  sftpStream.handle(reqid, handle);
			}).on('READ', (reqid, handle, offset, length) => {
			  if (handle.length !== hl || !openFiles[handle.readUInt32BE(0, true)])
				return sftpStream.status(reqid, ssh2.SFTP_STATUS_CODE.FAILURE);
			  //var state = openFiles[handle.readUInt32BE(0, true)];
			  if (offset >= filedata.length)
				sftpStream.status(reqid, ssh2.SFTP_STATUS_CODE.EOF);
			  else {
				//state.read = true;
				sftpStream.data(reqid, filedata.slice(offset, offset+handle.length));
			  }
			}).on('CLOSE', (reqid, handle) => {
			  var fnum;
			  if (handle.length !== hl || !openFiles[(fnum = handle.readUInt32BE(0, true))])
				return sftpStream.status(reqid, ssh2.SFTP_STATUS_CODE.FAILURE);
			  delete openFiles[fnum];
			  sftpStream.status(reqid, ssh2.SFTP_STATUS_CODE.OK);
			}).on('REALPATH', (reqid, path) => {
			  sftpStream.name(reqid, {filename: "/"});
			}).on('STAT', onSTAT)
			.on('LSTAT', onSTAT);
		  });
		});
	  });
	}).listen(0, "0.0.0.0", function() {
	  console.log(`[FADe] SFTP Server is Listening on ${this.address().port} Port.
  [FADe] To get your package from SFTP, please enter on destination system:
  [FADe] $ sftp -P ${this.address().port} ${allowedUser}@this-machine-ip
  [FADe] Password: ${allowedPass}
  [FADe] SFTP> get ${filename}`);
	});
  }
  
  function web_server(sftpport, filename, filedata) {
	app.get('/', (req, res) => {
	  res.send(`<!DOCTYPE html>
  <head>
	<title>FADe Binary download</title>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
	<h1>FADe Binary Download</h1>
	<p>Welcome to FADe binary Download page.</p>
	<a href="/${filename}">Click here to Download binary via HTTP.</a>
	<p>OR Download via SFTP: </p>
	<pre>
	$ sftp -P ${sftpport} fade@${req.hostname}
	Password: fade-project
	SFTP> get ${filename}
	</pre>
	<div style="font-size: 0.4rem; color: grey">
	Due to ssh2 module restrictions, please note that GUI client won't work.<br>
	Generated by <a href="//github.com/fade-project/fade">FADe Project</a> under MIT License with <3 
	</div>
  </body>
  
  <!-- cURL Friendly Abstract - to download binary:
	$ curl -O ${req.hostname}/${filename}
  -->`);
	}).get('/'+filename, (req, res) => {
	  res.writeHead(200, {
		'Content-Disposition': `attachment; filename="${filename}"`,
		'Content-Type': "application/octet-stream"
	  });
	  res.end(filedata);
	})
	var server = app.listen(0, () => {
	  console.log(`[FADe] Web Server Listening at http://localhost:${server.address().port}`)
	})
  }
  

function main() {
	//console.debug(args);
	if(args.hasOwnProperty("help")) {
		console.log(help(false));
	}else if(args.hasOwnProperty("init")) {
		init();
	}else if(args.hasOwnProperty("edit")) {
		edit();
	}else if(args.hasOwnProperty("create-deb")) {
		create_deb();
	}else if(args.hasOwnProperty("moo")) {
		console.error("[FADe] Actually, FADe has Half-cow Powers.");
		console.error("\t\t(__) \n\t\t(oo) \n\t      ---\\/ \n\t\t||   \n\t      --/\\ \n\t\t~~ ");
	}else{
		console.error("[FADe] Invalid or no option given.");
		console.error(help(true));
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
	return_val += "\t--depend[ency]: No effect, Another parameter to edit dependency will be provided in future releases.\n";
	return_val += "--[create-]deb [parameters]: Create .deb to Install your project to Debian-based systems\n";
	return_val += "\t--path \"/path/to/dir\": Locate your project.\n";
	return_val += "\t--o[utput] [/path/to/dir/]output.deb: Change output deb, Default is name_version_arch.deb on project directory.\n";
	return_val += "\t--host: Host binary to network instead of writing to file.\n";
	return_val += "--h[elp]: Show this help message.\n";
	return_val += serious_mode?"":"\n\tMaybe this FADe has Super Cow Powers..?";
	return return_val;
}

function create_deb() {
	if(!args.hasOwnProperty("path")) {
		console.error("[FADe] --create-deb can't be used without --path parameter.");
		process.exit(1);
	} var path = args['path'];
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
	} var fadework = path + '/.fadework';
	var dataraw = require(fadework+'/fade.json');
	var control = generate_deb_control(dataraw['name'], dataraw['version'], dataraw['maintainer_name'], dataraw['maintainer_email'], dataraw['depends'],
										dataraw['architecture'], dataraw['priority'], dataraw['url'], dataraw['desc']);
	var postinst = generate_deb_postinst(dataraw['name'], dataraw['version'], dataraw['desc'], dataraw['run'], dataraw['type'], dataraw['maintainer_name'],
										dataraw['maintainer_email'], dataraw['postinst_payload']);
	var prerm = generate_deb_prerm(dataraw['name'], dataraw['type'], dataraw['prerm_payload']);
	var name = dataraw['name'];
	var version = dataraw['version'];
	var architecture = dataraw['architecture'];
	function finalize() {
		rimraf.sync(fadework+'/internal');
		rimraf.sync(fadework+'/temp');
		rimraf.sync(fadework+'/usr/lib/'+name);
		fs.mkdirSync(fadework+'/internal', 0755);
		fs.mkdirSync(fadework+'/usr/lib/'+name, 0755);
		fs.writeFileSync(fadework+'/usr/lib/'+name+"/DO_NOT_PUT_FILE_ON_THIS_DIRECTORY", "ANYTHING IN THIS DIRECTORY IS WILL BE DISCARDED");
	}
	if (fs.existsSync(fadework+'/internal')) {
        rimraf.sync(fadework+'/internal');
	} fs.mkdirSync(fadework+'/internal', 0755);

	if (fs.existsSync(fadework+'/usr/lib/'+name)) {
        rimraf.sync(fadework+'/usr/lib/'+name);
	} fs.mkdirSync(fadework+'/usr/lib/'+name, 0755);

	if (fs.existsSync(fadework+'/temp')) {
        rimraf.sync(fadework+'/temp');
	} fs.mkdirSync(fadework+'/temp', 0755);

	fs.writeFileSync(fadework+"/internal/control", control);
    fs.writeFileSync(fadework+"/internal/postinst", postinst);
    fs.chmodSync(fadework+"/internal/postinst", 0755);
    fs.writeFileSync(fadework+"/internal/prerm", prerm);
	fs.chmodSync(fadework+"/internal/prerm", 0755);
	fs.writeFileSync(fadework+"/temp/debian-binary", "2.0\n");
	fs.chmodSync(fadework+"/temp/debian-binary", 0644);	
	var promise_copy = copy(path, fadework+'/usr/lib/'+name, {overwrite: true,	expand: true, dot: true, junk: true, filter: ['**/*', '!.fadework', '!.fadework/*']});
	promise_copy.then(function() {
		var promise_control = promise_targz_compress({src: fadework+"/internal", dest: fadework+"/temp/control.tar.gz", tar: {entries: ["."]}});
		var promise_data = promise_targz_compress({src: fadework, dest: fadework+"/temp/data.tar.gz", tar: {entries: ["usr/"]}});
		Promise.all([promise_control, promise_data]).then(() => {
			var magic_header = Buffer.from("!<arch>\n");
			var debian_binary_content = Buffer.from("2.0\n");
			var debian_binary_header = generate_ar_header("debian-binary", Math.floor(Date.now()/1000), 0, 0, 100644, debian_binary_content.length);
			var control_tar_gz_content = fs.readFileSync(fadework+"/temp/control.tar.gz");
			if (control_tar_gz_content.length % 2 !== 0) {
				control_tar_gz_content = Buffer.concat([control_tar_gz_content, Buffer.alloc(1,0)],control_tar_gz_content.length+1);
			}
			var control_tar_gz_header = generate_ar_header("control.tar.gz", Math.floor(Date.now()/1000), 0, 0, 100644, control_tar_gz_content.length);
			var data_tar_gz_content = fs.readFileSync(fadework+"/temp/data.tar.gz");
			if (data_tar_gz_content.length % 2 !== 0) {
				data_tar_gz_content = Buffer.concat([data_tar_gz_content, Buffer.alloc(1,0)],data_tar_gz_content.length+1);
			}
			var data_tar_gz_header = generate_ar_header("data.tar.gz", Math.floor(Date.now()/1000), 0, 0, 100644, data_tar_gz_content.length);
			var totalLength = magic_header.length+debian_binary_header.length+debian_binary_content.length+control_tar_gz_header.length+control_tar_gz_content.length+data_tar_gz_header.length+data_tar_gz_content.length;
			var deb_content = Buffer.concat([magic_header, debian_binary_header, debian_binary_content, control_tar_gz_header, control_tar_gz_content, data_tar_gz_header, data_tar_gz_content], totalLength);
			if(args.hasOwnProperty("host")) {
				var sftpKey;
				if(fs.existsSync(fadework+"/sftp.key")) {
					sftpKey = fs.readFileSync(fadework+"/sftp.key");
				}else{
					rsa.generateKeyPair();
					sftpKey = rsa.exportKey();
					fs.writeFileSync(fadework+"/sftp.key", sftpKey);
				}
				var sftpsv = sftp_server(sftpKey, "fade", "fade-project", name+"_"+version+"_"+architecture+".deb", deb_content);
				setTimeout(() => {
					web_server(sftpsv.address().port, name+"_"+version+"_"+architecture+".deb", deb_content);
				}, 3);
			} else {
				var output = args.hasOwnProperty("output") ? args['output'] : ret_default("output", path+"/"+name+"_"+version+"_"+architecture+".deb");
				fs.writeFileSync(output, deb_content);
				console.log("[FADe] "+output+" Created. Install on your system!");
			}
			finalize();
		}).catch((err) => {
			console.error("[FADe] Compress Failed.");
			console.error(err);
			finalize();
			process.exit(1);
		});
	}).catch((err) => {
		console.error("[FADe] Copy Failed.");
		console.error(err);
		finalize();
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
	if(!args.hasOwnProperty("path")) {
		console.error("[FADe] --edit can't be used without --path parameter.");
		process.exit(1);
	} var path = args['path'];
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
	} var fadework = path + '/.fadework';
	var dataraw = require(fadework+'/fade.json');
	if(args.hasOwnProperty("name")) dataraw['name'] = args['name'];
	if(args.hasOwnProperty("description")) dataraw['desc'] = args['description'];
	if(args.hasOwnProperty("version")) dataraw['version'] = args['version'];
	if(args.hasOwnProperty("url")) dataraw['url'] = args['url'];
	if(args.hasOwnProperty("architecture")) dataraw['architecture'] = args['architecture'];
	if(args.hasOwnProperty("priority")) dataraw['priority'] = args['priority'];
	if(args.hasOwnProperty("cmdline")) dataraw['run'] = args['cmdline'];
	if(args.hasOwnProperty("maintainer-name")) dataraw['maintainer_name'] = args['maintainer-name'];
	if(args.hasOwnProperty("maintainer-email")) dataraw['maintainer_email'] = args['maintainer-email'];
	if(args.hasOwnProperty("type")) dataraw['type'] = args['type'];
	/* Dependency Configuration here */
	if(args.hasOwnProperty("postinst-payload")) {
		if(args.hasOwnProperty("input")) {
			dataraw['postinst_payload'] = fs.readFileSync(args['input']).toString();
		}else{
			dataraw['postinst_payload'] = open_editor('postinst', dataraw['postinst_payload']);
		}
	}
	if(args.hasOwnProperty("prerm-payload")) {
		if(args.hasOwnProperty("input")) {
			dataraw['prerm_payload'] = fs.readFileSync(args['input']).toString();
		}else{
			dataraw['prerm_payload'] = open_editor('prerm', dataraw['prerm_payload']);
		}
	}

	var data = JSON.stringify(dataraw);
	fs.writeFileSync(fadework+'/fade.json', data);
	console.log("[FADe] Your amendments were reflected.");
}

function init() {
	//var test = (args.hasOwnProperty("test")) ? args['test'] : rls.question("What is Test?");
	var path            = (args.hasOwnProperty("path"))            ? args['path']            : rls.question("[FADe] Locate your project's dir: ");
	var name            = (args.hasOwnProperty("name"))            ? args['name']            : rls.question("[FADe] Enter your project's name: ");
	var version         = (args.hasOwnProperty("version"))         ? args['version']         : rls.question("[FADe] Enter your project's version: ");
	var description     = (args.hasOwnProperty("description"))     ? args['description']     : rls.question("[FADe] Enter your project's description: ");
	var url             = (args.hasOwnProperty("url"))             ? args['url']             : ret_default("url", "https://example.com/");
	var architecture    = (args.hasOwnProperty("architecture"))    ? args['architecture']    : ret_default("architecture", "all");
	var dependency_raw  = (args.hasOwnProperty("dependency"))      ? args['dependency']      : ret_default("dependency", "ask");
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
	var priority        = (args.hasOwnProperty("priority"))        ? args['priority']        : ret_default("priority", "optional");
	var cmdline         = (args.hasOwnProperty("cmdline"))         ? args['cmdline']         : rls.question("[FADe] Enter your project's cmdline: ");
	var maintainer_name = (args.hasOwnProperty("maintainer-name")) ? args['maintainer-name'] : rls.question("[FADe] Enter maintainer's name: ");
	var maintainer_email= (args.hasOwnProperty("maintainer-email"))? args['maintainer-email']: rls.question("[FADe] Enter maintainer's email: ");
	var type            = (args.hasOwnProperty("type"))            ? args['type']            : rls.question("[FADe] Select type (systemd, isolated, normal): ")
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
	});
	if (fs.existsSync(path+"/fadework")) {
		rimraf.sync(path+"/fadework");
	}
	if (fs.existsSync(fadework)) {
		rimraf.sync(fadework);
	}
	if (!fs.existsSync(fadework)) {
		fs.mkdirSync(fadework, 0755);
	}
	fs.mkdirSync(fadework+'/usr', 0755);
	fs.mkdirSync(fadework+'/usr/bin', 0755);
	fs.mkdirSync(fadework+'/usr/lib', 0755);
	fs.mkdirSync(fadework+'/usr/lib/'+name, 0755);
	fs.writeFileSync(fadework+'/usr/lib/'+name+"/DO_NOT_PUT_FILE_ON_THIS_DIRECTORY", "ANYTHING IN THIS DIRECTORY IS WILL BE DISCARDED");
	fs.mkdirSync(fadework+'/internal', 0755);
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
