import { debTypes } from '../deb-build';
import deb from '../deb-build';
import fsLegacy, {promises as fs} from 'fs';
import rimraf from 'rimraf';
import copy from 'recursive-copy';
import { release } from 'os';
import child_process from 'child_process';
import tmpjs from 'tmp';

import buffer_server from 'buffer-server';
import NodeRSA from 'node-rsa';
import minimist from 'minimist';
const rsa = new NodeRSA({b: 256});

export interface FADeConfiguration {
    name: string,
    version: string,
    desc: string,
    url: string,
    architecture: string,
    depends: Array<string>,
    priority: string,
    run: string,
    maintainer_name: string,
    maintainer_email: string,
    type: string,
    postinst_payload: string,
    prerm_payload: string,
    blacklist: Array<string>
}
export async function getFADeConfig(path: string): Promise<FADeConfiguration> {
    return <FADeConfiguration>JSON.parse(await fs.readFile(`${path}/.fadework/fade.json`, { encoding: "utf-8"}));
}

export function isFadeworkPresent(path: String, allowAlsoOldFadework?: boolean): boolean {
    return (!!allowAlsoOldFadework && fsLegacy.existsSync(`${path}/fadework`)) || fsLegacy.existsSync(`${path}/.fadework`);
}

export function isSameOrUndef(original: any, incoming: any): boolean {
    return (typeof incoming === "undefined") || original == incoming;
}

export function args2config(args: minimist.ParsedArgs): FADeConfiguration {
    return {
        name: args.name,
        version: args.version,
        desc: args.description,
        url: args.url,
        architecture: args.architecture,
        depends: (typeof args.dependency === "string") ? [ args.dependency ] : args.dependency,
        priority: args.priority,
        maintainer_name: args['maintainer-name'],
        maintainer_email: args['maintainer-email'],
        type: args.type,
        postinst_payload: (args['input-postinst-payload']) ? fsLegacy.readFileSync(args['input-postinst']).toString() : undefined,
        prerm_payload: (args['input-prerm-payload']) ? fsLegacy.readFileSync(args['input-prerm']).toString() : undefined,
        blacklist: (typeof args.blacklist === "string") ? [ args.blacklist ] : args.blacklist
    } as FADeConfiguration;
}

export async function validate(path: string): Promise<boolean> {
    if(!isFadeworkPresent(path, true)) {
        throw new Error("fadework/ or .fadework/ not found, please do --init.");
    }
    if(fsLegacy.existsSync(`${path}/fadework/fade-electron.json`) || fsLegacy.existsSync(`${path}/fadework/internal-sh`)) {
        throw new Error("FADe Project was reborn from scratch, so this project is not compatible. Please do --init.");
    }else if(fsLegacy.existsSync(`${path}/fadework`)){
        console.log(`[FADe] Found Legacy FADe directory, migrating...`);
        await fs.rename(`${path}/fadework`, `${path}/.fadework`)
    }
    const data = await getFADeConfig(path);
    let modified = false as boolean;
    if(data.type === debTypes.systemd) {
        console.warn(`[FADe] "systemd" type is now deprecated, migrating to "service" type...`);
        data.type = "service";
        modified = true;
    }
    if(data.type !== debTypes.isolated && data.type !== debTypes.service && data.type !== debTypes.normal) {
        throw new Error("Invalid type. see docs for valid types.");
    }
    if(typeof data.blacklist === "undefined") {
		console.warn("[FADe] Detected no blacklist field, creating...");
        data.blacklist = ['.fadework/', '.git/'];
        modified = true;
    }
    if(typeof data.depends === "string") {
        console.warn("[FADe] Detected old comma-style depends field, migirating...");
        data.depends = (<string>data.depends).split(", ");
        modified = true;
    }
    if(modified) {
        await fs.writeFile(`${path}/.fadework/fade.json`, JSON.stringify(data, null, 2));
    }
    return true;
}

export function genRunbin(input: FADeConfiguration): string {
    let str = `#!/bin/bash
${(input.type == debTypes.service)? `echo "Start ${input.name} service instead."
echo "ex) systemctl start ${input.name}"
`:''}
${(input.type == debTypes.isolated)?`if [ $EUID -ne 0 ]; then
echo "[FADe] To run this script securely, we need sudo privilege."
fi
cd /usr/lib/${input.name}
exec sudo -H -u ${input.name} ${input.run} $*
`:''}
${(input.type == debTypes.normal)?`
cd /usr/lib/${input.name}
${input.run}
`:''}`;
    return str;
}

export function ret_default(key: string, req_default: any): any {
    console.warn(`[FADe] ${key} not set, defaulting to ${req_default}`);
	return req_default;
}

export function checkBlacklist(blacklist: Array<string>, name: string): boolean {
	if(blacklist.includes(name)) {
		return false;
	} else {
		blacklist.forEach((val) => {
			if(val.endsWith('/') && name.startsWith(val)) {
				return false;
			}
		});
	}
	return true;
}

export async function openEditor(filename: string, filedata: string): Promise<string> {
    if(!process.env.EDITOR) {
        if(process.platform === "win32") {
            if(release().split('.')[0] == "10" && parseInt(release().split('.')[2]) >= 17763) {
                console.warn("[FADe] %EDITOR% not set, defaulting to notepad.exe");
				process.env.EDITOR = "notepad.exe"
            }else {
				throw new Error(`[FADe] %EDITOR% not set and Your notepad.exe dosen't support LF Ending.
Please download your preferred editor from the Internet. We recommend vim or nano
 - Vim: https://www.vim.org/download.php#pc
 - Nano: https://www.nano-editor.org/dist/win32-support/
 
Put downloaded binary into C:\\Windows\\system32 or your working directory, and Please type before run FADe:
> set EDITOR=(binary).exe`);
			}
		}else{
            console.warn("[FADe] $EDITOR not set, defaulting to vi");
            process.env.EDITOR = "vi"
        }
    }
    let tmpfile = tmpjs.tmpNameSync();
    console.log(`[FADe] Opening ${filename} with $EDITOR.`);
    await fs.writeFile(tmpfile, filedata);
    await child_process.spawn(process.env.EDITOR, [tmpfile], { stdio: 'inherit', detached: true});
    let return_val = (await fs.readFile(tmpfile)).toString();
    await fs.unlink(tmpfile);
    return return_val;
}

export async function stubCreateDeb(path: string, host: boolean, output?: string): Promise<boolean> {
    if(process.platform === "win32") {
        console.warn(`[FADe] You are building .deb binary on Windows.
Due to NTFS Restrictions, It's not possible to set UNIX permission.
However, i tried to support win32 platform, so postinst and prerm scripts will run perfectly.
But your project data doesn't. So if you have a trouble with permission,
Please do chmod on postinst script. Thank you.`);
    }
    await validate(path);
    const data = await getFADeConfig(path);
    rimraf.sync(`${path}/.fadework/usr/lib/${data.name}`);
    await fs.mkdir(`${path}/.fadework/usr/lib/${data.name}`, 0o755);
    await copy(path, `${path}/.fadework/usr/lib/${data.name}`, {
        overwrite: true,
        expand: true,
        dot: true,
        junk: false,
        filter: data.blacklist ? processingName => { return checkBlacklist(data.blacklist, processingName) } : undefined
    });
    let debData = await deb(path, data);
    rimraf.sync(`${path}/.fadework/usr/lib/${data.name}`);
    await fs.mkdir(`${path}/.fadework/usr/lib/${data.name}`, 0o755);
    await fs.writeFile(`${path}/.fadework/usr/lib/${data.name}/DO_NOT_PUT_FILE_ON_THIS_DIRECTORY`, "ANYTHING IN THIS DIRECTORY IS WILL BE DISCARDED");
    if(host) {
        let sftpKey;
        if(fsLegacy.existsSync(`${path}/.fadework/sftp.key`)) {
            sftpKey = (await fs.readFile(`${path}/.fadework/sftp.key`)).toString();
        }else{
            rsa.generateKeyPair();
            sftpKey = rsa.exportKey();
            fs.writeFile(`${path}/.fadework/sftp.key`, sftpKey);
        }
        let sftpPort = await buffer_server.sftp_server(sftpKey, "fade", "fade-project", `${data.name}-${data.version}_${data.architecture}.deb`, debData);
        let webindex = `<!DOCTYPE html>
<head>
	<title>FADe Binary download</title>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
	<h1>FADe Binary Download</h1>
	<p>Welcome to FADe binary Download page.</p>
	<a href="/${data.name}-${data.version}_${data.architecture}.deb">Click here to Download binary via HTTP.</a>
	<p>OR Download via SFTP: </p>
	<pre>
$ sftp -P ${sftpPort} fade@this-server-ip
Password: fade-project
SFTP> get ${data.name}-${data.version}_${data.architecture}.deb
	</pre>
	<div style="font-size: 0.4rem; color: grey">
		Due to ssh2 module restrictions, please note that GUI client won't work.<br>
		Generated by <a href="//github.com/fade-project/fade">FADe Project</a> under MIT License with <3 
	</div>
</body>

<!-- cURL Friendly Abstract - to download binary:
	$ curl -O this-server-ip/${data.name}-${data.version}_${data.architecture}.deb
-->`;
            let webPort = await buffer_server.web_server(webindex, `${data.name}-${data.version}_${data.architecture}.deb`, debData);
            console.log(`[FADe] SFTP Server is listening on ${sftpPort} Port.
[FADe] To get your package from SFTP, please enter on destination system:
[FADe] $ sftp -P ${sftpPort} fade@this-machine-ip
[FADe] Password: fade-project
[FADe] SFTP> get ${data.name}-${data.version}_${data.architecture}.deb
[FADe] Web Server is listening at http://localhost:${webPort}`);
    }else{
        await fs.writeFile((!output) ? `${data.name}-${data.version}_${data.architecture}.deb` : output, debData);
        console.log(`[FADe] ${(!output) ? `${data.name}-${data.version}_${data.architecture}.deb` : output} Created. Install on your system!`);

    }
    return true;
}