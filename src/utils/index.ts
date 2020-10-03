import { debTypes } from '../deb-build';
import deb from '../deb-build';
import fsLegacy, {promises as fs} from 'fs';
import rimraf from 'rimraf';
import copy from 'recursive-copy';
import { release } from 'os';
import child_process from 'child_process';
import tmpjs from 'tmp';

export interface FADeConfiguration {
    name: String,
    version: String,
    desc: String,
    url: String,
    architecture: String,
    depends: Array<String>,
    priority: String,
    run: String,
    maintainer_name: String,
    maintainer_email: String,
    type: String,
    postinst_payload: String,
    prerm_payload: String,
    blacklist: Array<String>
}
export async function getFADeConfig(path: String): Promise<FADeConfiguration> {
    return <FADeConfiguration>JSON.parse(await fs.readFile(`${path}/.fadework/fade.json`, { encoding: "utf-8"}));
}

export async function validate(path: String): Promise<boolean> {
    if(fsLegacy.existsSync(`${path}/fadework/fade-electron.json`) || fsLegacy.existsSync(`${path}/fadework/internal-sh`)) {
        throw new Error("FADe Project was reborn from scratch, so this project is not compatible. Please do --init.");
    }else if(fsLegacy.existsSync(`${path}/fadework`)){
        console.log(`[FADe] Found Legacy FADe directory, migrating...`);
        await fs.rename(`${path}/fadework`, `${path}/.fadework`)
    }
    const data = await getFADeConfig(path);
    let modified = false as boolean;
    if(data.type === "systemd") {
        console.warn(`[FADe] "systemd" type is now deprecated, migrating to "service" type...`);
        data.type = "service";
        modified = true;
    }
    if(typeof data.blacklist === "undefined") {
		console.warn("[FADe] Detected no blacklist field, creating...");
        data.blacklist = ['.fadework/', '.git/'];
        modified = true;
    }
    if(typeof data.depends === "string") {
        console.warn("[FADe] Detected old comma-style depends field, migirating...");
        data.depends = (<String>data.depends).split(", ");
        modified = true;
    }
    if(modified) {
        await fs.writeFile(`${path}/.fadework/fade.json`, JSON.stringify(data, null, 2));
    }
    return true;
}

export function genRunbin(input: FADeConfiguration): String {
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

export function ret_default(key: String, req_default: any): any {
    console.warn(`[FADe] ${key} not set, defaulting to ${req_default}`);
	return req_default;
}

export function checkBlacklist(blacklist: Array<String>, name: string): boolean {
	if(blacklist.includes(name)) {
		return false;
	} else {
		blacklist.forEach((val) => {
			if(val.endsWith('/') && name.startsWith(<string>val)) {
				return false;
			}
		});
	}
	return true;
}
export async function openEditor(filename: String, filedata: string): Promise<String> {
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
    if(host) {
        throw new Error("WIP");
    }else{
        await fs.writeFile((!output) ? `${data.name}-${data.version}_${data.architecture}.deb` : output, debData);
        console.log(`[FADe] ${(!output) ? `${data.name}-${data.version}_${data.architecture}.deb` : output} Created. Install on your system!`);

    }
    return true;
}