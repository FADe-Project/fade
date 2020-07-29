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
var args = process.argv.slice(2);
var rls = require('readline-sync');
var ln = '\n';
var fs = require("fs");
var rimraf = require("rimraf");
var args = require('minimist')(process.argv.slice(2), {
    alias: {
        h: 'help',
		v: 'verbose',
		depend: 'dependancy'
    }
});
main();

function generate_control(name, version, maintainer_name, maintainer_email, depends, url, desc) {
    str = "";
    str += "Package: " + name + ln;
    str += "Version: " + version + ln;
    str += "Priority: Optional\n"; //Will be editable in future releases.
    str += "Architecture: all\n"; //Will be editable in future releases.
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
        str += "bash -c \"cd /usr/lib/"+name+";"+cmdline+"\"\n";
    }
    //console.log("RunBin File: \n"+str);
    return str;
}
function generate_postinst(name, version, desc, cmdline, type, maintainer_name, maintainer_email, postinst) {
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
function generate_prerm(name, type, prerm) {
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
	return_val += serious_mode?"":"This program is free software, Please refer LICENCE to detail\n";
	return_val += serious_mode?"":"Copyright (C) FADe Project, All rights reserved.\n\n";
	return_val += "--init [parameters]: Initialize your project.\n";
	return_val += "\t--path \"/path/to/dir\": Locate your project.\n";
	return_val += "\t--name test-project: Set your project's name (package manager friendly)\n"
	return_val += "\t--version 0.0.1: Set your project's version\n";
	return_val += "\t--description \"The Test Project\": Set your project's description.\n";
	return_val += "\t--url \"https://example.com/\": Set your project's official website, Default is \"https://example.com\"\n";
	return_val += "\t--priority optional: Set project's priority, Default is optional\n"
	return_val += "\t--architecture all: Set project's destination system, Default is all\n";
	return_val += "\t--depend[ancy] nodejs: Set project's dependancies; this parameter can be used multiple times."
	return_val += "\t--cmdline \"node main.js\": Set your project's run command\n";
	return_val += "\t--maintainer-name \"John Doe\": Set maintainer's name\n";
	return_val += "\t--maintainer-email \"john@example.com\": Set maintainer's email address\n";
	return_val += "\t--type [systemd, isolated, normal]: Set project's type. see manual to detail.\n"
	return_val += "\n"; 
	return_val += "--h[elp]: Show this help message.\n";
	return_val += serious_mode?"":"\n\tMaybe this FADe has Super Cow Powers..?";
	return return_val;
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
	if (fs.existsSync(fadework+'/fade.json')) {
		fs.unlinkSync(fadework+'/fade.json');
	}
	fs.writeFileSync(fadework+'/fade.json', data);
	fs.writeFileSync(fadework+"/usr/bin/"+name, generate_runbin(name, cmdline, type));
	console.log(`
[FADe] Structure is successfully created.
[FADe] Please refer manual and --help to next process. 
[FADe] To edit your prerm and postinst payload, Please run:
[FADe] --edit [--postinst-payload] [--prerm-payload]
[FADe] Thanks for using FADe Project.
	`);
}