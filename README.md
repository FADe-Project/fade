# FADe Project
FADe Project Converts your project into a package.

## Usage
```
--init [parameters]: Initialize your project.
    --path PATH: Locate your project. [REQUIRED]
    --name PROJECT_NAME: Set your project's name (package manager friendly) [REQUIRED]
    --version VERSION: Set your project's version. [REQUIRED]
    --desc[ription] DESCRIPTION: Set your project's description [REQUIRED]
    --run CMDLINE: Set your project's run command. [REQUIRED]
    --maintainer-name MAINTAINTER_NAME: Set maintainer's name. [REQUIRED]
    --maintainer-email MAINATINER_EMAIL: Set maintainer's email. [REQUIRED]
    --type [service, isolated, normal] : Set project's type. See docs. [REQUIRED]
    --depend[ency] DEPENDENCY: Set project's dependency. [MULTIPLE]
    --url URL: Set project's official website. Default is "https://example.com/"
    --priority PRIORITY: Set project's priority. Default is "optional"
    --arch[itecture] ARCHITECTURE: Set project's architecture. Default is "all"
    --blacklist BLACKLIST[/]: Exclude specific file or directory from build (Note that blacklisting a directory requires end with '/') [MULTIPLE]
    --i[nput] FILENAME: Despite above parameters, use specific fade.json to configure your project.
--edit [parameters]: Edit your project's configuration with --init's parameters. Additional parameters:
    --edit-postinst[-payload]: Edit Post-Install Script's payload with your preferred editor.
    --edit-prerm[-payload]: Edit Pre-Remove Script's payload with your preferred editor.
    --i[nput] filename: No effect due to compatibility issues.
    --prerm-payload: No effect due to compatibility issues.
    --postinst-payload: No effect due to compatibility issues.
    --depend[ency]: No effect.
    --depend[ency]-add: Add dependency to your project. [MULTIPLE]
    --depend[ency]-rm: Remove dependency from your project. [MULTIPLE]
    --blacklist: No effect.
    --blacklist-add: Add blacklist to your project. [MULTIPLE]
    --blacklist-rm: Remove Blacklist from your project. [MULTIPLE]
--[create-]deb [parameters]: Create .deb in order to install your project to debian-based systems
    --path PATH: Locate your project. [REQUIRED]
    --o[utput] OUTPUT: Change output deb, Default is "name_version_arch.deb" on current directory.
    --host: Host binary to the network instead of writing to file.
--h[elp]: Show help message.
```

### Quick Test
 1. Install Typescript.
```
 $ npm install -g typescript
```
 2. Install yarn (It depends on your OS)
 3. Install dependencies.
```
 $ yarn install
```
 4. Do it.
```
 $ yarn start [ARGUMENTS]
```
 5. PROFIT!

### Compile
 1. Install Typescript.
```
 $ npm install -g typescript
```
 2. Install yarn (It depends on your OS)
 3. Install dependencies.
```
 $ yarn install
```
 4. Run Typescript Compiler.
```
 $ tsc
```
 5. Now, you can use dist/ as you needed.

## Known Issues
* There's no known issues. if you found bug, please report to [Issues](https://github.com/fade-project/fade/issues)

## TO-DO
* Create Redhat Package

## License
 * FADe Project is distributed under MIT License.
 * Please refer [OPEN_SOURCE.md](OPEN_SOURCE.md) for open source programs/libraries that used by FADe Project.