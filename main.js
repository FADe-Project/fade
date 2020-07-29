#!/usr/bin/env node

//    _______   ___        ___             _         __ 
//   / __/ _ | / _ \___   / _ \_______    (_)__ ____/ /_
//  / _// __ |/ // / -_) / ___/ __/ _ \  / / -_) __/ __/
// /_/ /_/ |_/____/\__/ /_/  /_/  \___/_/ /\__/\__/\__/ 
//                                   |___/              
//
//  FADe Project (CLI Edition) Source code
//  This program is free software, please refer LICENCE to detail.
//  Copyright (C) FADe-Project, All rights reserved.
//  WARNING: This Source code IS COMPLETELY spaghetti code.

const fade_version = "Git Version";
var rls = require('readline-sync');
var ln = '\n';
var tmpjs = require('tmp');
var child_process = require('child_process');
var fs = require("fs");
var rimraf = require("rimraf");
var copy = require('recursive-copy');
var targz = require("targz");
var args = require('minimist')(process.argv.slice(2), {
    alias: {
        h: 'help',
		v: 'verbose',
		o: 'output',
		depend: 'dependancy',
		deb: 'create-deb'
    }
});
main();

function promise_targz_compress(opt) {
    return new Promise((res, rej) => {
        targz.compress(opt, function(err) {
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
        str += "exec sudo -H -u " + name + " " + cmdline + " $@\n";
    }
    if(type == "normal") {
        str += "bash -c \"cd /usr/lib/"+name+";"+cmdline+" $@\"\n";
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
	return_val += serious_mode?"":"This program is free software under GNU GPLv3+, Please refer LICENCE to detail\n";
	return_val += serious_mode?"":"Copyright (C) FADe Project, All rights reserved.\n\n";
	return_val += "--init [parameters]: Initialize your project.\n";
	return_val += "\t--path \"/path/to/dir\": Locate your project.\n";
	return_val += "\t--name test-project: Set your project's name (package manager friendly)\n"
	return_val += "\t--version 0.0.1: Set your project's version\n";
	return_val += "\t--description \"The Test Project\": Set your project's description.\n";
	return_val += "\t--url \"https://example.com/\": Set your project's official website, Default is \"https://example.com\"\n";
	return_val += "\t--priority optional: Set project's priority, Default is optional\n"
	return_val += "\t--architecture all: Set project's destination system, Default is all\n";
	return_val += "\t--depend[ancy] nodejs: Set project's dependancies; this parameter can be used multiple times.\n"
	return_val += "\t--cmdline \"node main.js\": Set your project's run command\n";
	return_val += "\t--maintainer-name \"John Doe\": Set maintainer's name\n";
	return_val += "\t--maintainer-email \"john@example.com\": Set maintainer's email address\n";
	return_val += "\t--type [systemd, isolated, normal]: Set project's type. see manual to detail.\n\n"
	return_val += "--edit [parameters]: Edit your project's configuration with --init's parameters. Additional parameters:\n"
	return_val += "\t--postinst-payload: Edit Post-Install Script's payload with your preferred editor.\n"
	return_val += "\t--prerm-payload: Edit Pre-Remove Script's payload with your preferred editor.\n\n"
	return_val += "--[create-]deb [parameters]: Create .deb to Install your project to Debian-based systems\n";
	return_val += "\t--path \"/path/to/dir\": Locate your project.\n";
	return_val += "\t--o[utput] \"/path/to/dir\": Change output deb's location, Default is project directory.\n";
	return_val += "--h[elp]: Show this help message.\n";
	return_val += serious_mode?"":"\n\tMaybe this FADe has Super Cow Powers..?";
	return return_val;
}

function create_deb() {
	if(!args.hasOwnProperty("path")) {
		console.error("[FADe] --create-deb can't be used without --path parameter.");
		process.exit(1);
	} var path = args['path'];
	if(!fs.existsSync(path+'/fadework')) {
		console.error("[FADe] Do --init first, please.");
		process.exit(1);
	} var fadework = path + '/fadework';
	var dataraw = require(fadework+'/fade.json');
	var control = generate_deb_control(dataraw['name'], dataraw['version'], dataraw['maintainer_name'], dataraw['maintainer_email'], dataraw['depends'],
										dataraw['architecture'], dataraw['priority'], dataraw['url'], dataraw['desc']);
	var postinst = generate_deb_postinst(dataraw['name'], dataraw['version'], dataraw['desc'], dataraw['run'], dataraw['type'], dataraw['maintainer_name'],
										dataraw['maintainer_email'], dataraw['postinst_payload']);
	var prerm = generate_deb_prerm(dataraw['name'], dataraw['type'], dataraw['prerm_payload']);
	var name = dataraw['name'];
	var version = dataraw['version'];
	var architecture = dataraw['architecture'];
	var deb_loc = args.hasOwnProperty("output") ? args['output'] : ret_default("output", path);
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
	var promise_copy = copy(path, fadework+'/usr/lib/'+name, {overwrite: true,	expand: true, dot: true, junk: true, filter: ['**/*', '!fadework', '!fadework/*']});
	promise_copy.then(function() {
		var promise_control = promise_targz_compress({src: fadework+"/internal", dest: fadework+"/temp/control.tar.gz", tar: {entries: ["."]}});
		var promise_data = promise_targz_compress({src: fadework, dest: fadework+"/temp/data.tar.gz", tar: {entries: ["usr/"]}});
		Promise.all([promise_control, promise_data]).then(function() {
			// TODO: ar w/o external binary
			child_process.execSync("ar r "+deb_loc+"/"+name+"_"+version+"_"+architecture+".deb "+fadework+"/temp/debian-binary "+fadework+"/temp/control.tar.gz "+fadework+"/temp/data.tar.gz");
			console.log("[FADe] "+deb_loc+"/"+name+"_"+version+"_"+architecture+".deb Created. Install on your system!");
			finalize();
		}).catch(function(err){
			console.error("[FADe] Compress Failed.");
			console.error(err);
			finalize();
			process.exit(1);
		});
	}).catch(function(err) {
		console.error("[FADe] Copy Failed.");
		console.error(err);
		finalize();
		process.exit(1);
	});
}

function edit() {
	if(process.env.EDITOR == undefined) {
		console.warn("[FADe] $EDITOR not set, defaulting to vi");
		process.env.EDITOR = "vi"
	}
	if(!args.hasOwnProperty("path")) {
		console.error("[FADe] --edit can't be used without --path parameter.");
		process.exit(1);
	} var path = args['path'];
	if(!fs.existsSync(path+'/fadework')) {
		console.error("[FADe] Do --init first, please.");
		process.exit(1);
	} var fadework = path + '/fadework';
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
	/* Dependancy Configuration here */
	if(args.hasOwnProperty("postinst-payload")) {
		var tmpfile = tmpjs.tmpNameSync();
		console.log('[FADe] Opening file with $EDITOR.');
		fs.writeFileSync(tmpfile, dataraw['postinst_payload']);
		child_process.spawnSync(process.env.EDITOR, [tmpfile], { stdio: 'inherit', detached: true});
		dataraw['postinst_payload'] = fs.readFileSync(tmpfile).toString();
		fs.unlinkSync(tmpfile);
	}
	if(args.hasOwnProperty("prerm-payload")) {
		var tmpfile = tmpjs.tmpNameSync();
		console.log('[FADe] Opening file with $EDITOR.');
		fs.writeFileSync(tmpfile, dataraw['prerm_payload']);
		child_process.spawnSync(process.env.EDITOR, [tmpfile], { stdio: 'inherit', detached: true});
		dataraw['prerm_payload'] = fs.readFileSync(tmpfile).toString();
		fs.unlinkSync(tmpfile);
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
	var dependancy_raw  = (args.hasOwnProperty("dependancy"))      ? args['dependancy']      : ret_default("dependancy", "ask");
		var dependancy = "";
		if (dependancy_raw == "ask") {
			dependancy = rls.question("[FADe] Enter your project's dependancy(seperated by comma): ");
		}else if(Array.isArray(dependancy_raw)) {
			dependancy_raw.forEach(function(item, index) {
				dependancy += (index != 0)?", ":"";
				dependancy += item;
			});
		}else{
			dependancy = dependancy_raw;
		}
	var priority        = (args.hasOwnProperty("priority"))        ? args['priority']        : ret_default("priority", "optional");
	var cmdline         = (args.hasOwnProperty("cmdline"))         ? args['cmdline']         : rls.question("[FADe] Enter your project's cmdline: ");
	var maintainer_name = (args.hasOwnProperty("maintainer-name")) ? args['maintainer-name'] : rls.question("[FADe] Enter maintainer's name: ");
	var maintainer_email= (args.hasOwnProperty("maintainer-email"))? args['maintainer-email']: rls.question("[FADe] Enter maintainer's email: ");
	var type            = (args.hasOwnProperty("type"))            ? args['type']            : rls.question("[FADe] Select type (systemd, isolated, normal): ")
	var fadework        = path + '/fadework';
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
		depends: dependancy,
		priority: priority,
		run: cmdline,
		maintainer_name: maintainer_name,
		maintainer_email: maintainer_email,
		type: type,
		postinst_payload: postinst_payload,
		prerm_payload: prerm_payload
	});
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