#!/usr/bin/env node

console.error("[FADe] main.js is now deprecated, please use yarn start or node dist/");
const __$TUB_F$ = require('fs');
if(__$TUB_F$.existsSync("./dist"))
	require("./dist");
else {
	console.error("[FADe] dist/ not found. FADe was rewritten into typescript. Please do tsc.");
}
/*

Whatever you write, i don't care();

*/