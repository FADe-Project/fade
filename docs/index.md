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

### service type
 * The project with this type generates both systemd and sysvinit service and service user.

### isolated type
 * The project with this type generates service user.
 * It generates /usr/bin/(projectname) which run your project as a service user.
 * /usr/bin/(projectname)'s data can be modified.

### normal type
 * The project with this type generates /usr/bin/(projectname) which run your project as current user.
 * /usr/bin/(projectname)'s data can be replaced.
 * Due to the nature of method, relative path won't work. if you need relative path, please use symlink type

### symlink type
 * The proect with this type links /usr/bin/(projectname) to your binary/script
 * The binary/script should located in your project directory and executable.

## Issue Report
 * Issues: [Github Issues](https://github.com/fade-project/fade/issues)
 * Maintainer: [ldmsys](https://github.com/ldmsys)