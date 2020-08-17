# Welcome to FADe Project
 * FADe Project converts your project into a package.
<!-- Insert Images here-->

<!--### Try on guide
 * Enter on your terminal:
```shell
 $ git clone https://github.com/fade-project/fade
 $ cd fade
 $ npm install
``` -->

## Types
 * FADe Project has 3 project types.

### systemd type
 * The project with this type generates systemd service and service user.

### isolated type
 * The project with this type generates service user.
 * It generates /usr/bin/(projectname) chdir to your project dir andwhich run your project as service user with sudo(8).
 * /usr/bin/(projectname)'s data can be replaced.

### normal type
 * This project with this type generates /usr/bin/(projectname) which chdir to your project dir and run your project as current user.
 * /usr/bin/(projectname)'s data can be replaced.

## Issue Report
 * Issues: [Github Issues](https://github.com/fade-project/fade/issues)
 * Maintainer: [ldmsys](https://github.com/ldmsys)