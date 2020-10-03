//    _______   ___        ___             _         __ 
//   / __/ _ | / _ \___   / _ \_______    (_)__ ____/ /_
//  / _// __ |/ // / -_) / ___/ __/ _ \  / / -_) __/ __/
// /_/ /_/ |_/____/\__/ /_/  /_/  \___/_/ /\__/\__/\__/ 
//                                   |___/              
//
//  FADe Project Source code
//  This program is distributed under MIT License.
//  Copyright (C) ldmsys, All rights reserved.

const fade_version = "Git Version";

import {} from './deb-build';
//import buffer_server from '@fade-project/buffer-server';

import tmpjs from 'tmp';
import copy from 'recursive-copy';
import rls from 'readline-sync';
import fsLegacy, {promises as fs} from 'fs';
import rimraf from 'rimraf';
import minimist from 'minimist';
import NodeRSA from 'node-rsa';
import { getFADeConfig, stubCreateDeb } from './utils';

const rsa = new NodeRSA({b: 256});
const args = minimist(process.argv.slice(2), {
    alias: {
        h: 'help',
        o: 'output',
        i: 'input',
        depend: 'dependency',
        depends: 'dependency',
        'depend-add': 'dependency-add',
        'depend-rm': 'dependency-rm',
        dependancy: 'dependency',
        'depends-add': 'dependency-add',
        'depends-rm': 'dependency-rm',
        deb: 'create-deb',
        desc: 'description'
    }
});


async function main() {
    if(typeof args.help !== "undefined") {
        console.log(help(false));
    }else if(typeof args.init !== "undefined") {
        console.log("init");
    }else if(typeof args.edit !== "undefined") {
        console.log("edit");
    }else if(typeof args["create-deb"] !== "undefined") {
        stubCreateDeb(args.path, false, args.output)
    }else if(args._[0] === "moo" || typeof args.moo !== "undefined") {
        console.error("[FADe] Actually, FADe has Half-cow Powers.");
		console.error("\t\t(__) \n\t\t(oo) \n\t      ---\\/ \n\t\t||   \n\t      --/\\ \n\t\t~~ ");
    }else{
        console.error("[FADe] Invalid or no option given.");
		console.error(help(true));
    }
}

function help(serious_mode: boolean): String {
    return `${!serious_mode?`FADe Project - CLI Edition / ${fade_version} Help
This program is distributed under MIT License.
Copyright (C) ldmsys, All rights reserved.
`:''}
--init [parameters]: Initialize your project.
    --path PATH: Locate your project. [REQUIRED]
    --name PROJECT_NAME: Set your project's name (package manager friendly) [REQUIRED]
    --version VERSION: Set your project's version. [REQUIRED]
    --desc[ription] DESCRIPTION: Set your project's description [REQUIRED]
    --cmdline CMDLINE: Set your project's run command. [REQUIRED]
    --maintainer-name MAINTAINTER_NAME: Set maintainer's name. [REQUIRED]
    --maintainer-email MAINATINER_EMAIL: Set maintainer's email. [REQUIRED]
    --type [service, isolated, normal] : Set project's type. See docs. [REQUIRED]
    --depend[ency] DEPENDENCY: Set project's dependency. [REQUIRED, MULTIPLE]
    --url URL: Set project's official website. Default is "https://example.com/"
    --priority PRIORITY: Set project's priority. Default is "optional"
    --architecture ARCHITECTURE: Set project's architecture. Default is "all"
    --blacklist BLACKLIST[/]: Exclude specific file or directory from build (Note that blacklisting a directory requires end with '/') [MULTIPLE]
    --i[nput] FILENAME: Despite above parameters, use specific fade.json to configure your project.
--edit [parameters]: Edit your project's configuration with --init's parameters. Additional parameters:
    --postinst-payload: Edit Post-Install Script's payload with your preferred editor.
    --prerm-payload: Edit Pre-Remove Script's payload with your preffered editor.
    --i[nput] filename: Use file as postinst/prerm payload.
    --depend[ency]: No effect.
    --depend[ency]-add: Add dependency to your project. [MULTIPLE]
    --depend[ency]-rm: Remove dependency from your project. [MULTIPLE]
    --blacklist: No effect.
    --blacklist-add: Add blacklist to your project. [MULTIPLE]
    --blacklist-rm: Remove Blacklist from your project. [MULTIPLE]
--[create-]deb [parameters]: CReate .deb in order to install your project to debian-based systems
    --path PATH: Locate your project. [REQUIRED]
    --o[utput] OUTPUT: Change output deb, Default is "name_version_arch.deb" on current directory.
    --host: Host binary to the network instead of writing to file.
--h[elp]: Show this help message.
${!serious_mode?`\n\tMaybe this FADe has Super Cow Powers...?`:''}`;
}


function checkBlacklist(blacklist: String, path: String) {

}



function openEditor(filename: String, filedata: String) {

}

function edit() {

}

function init() {

}

main();