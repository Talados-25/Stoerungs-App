// Wird von `npm version` aufgerufen: überträgt die Version aus package.json nach app.json
// und erhöht die iOS-Buildnummer.
const fs = require('fs');
const { version } = require("../package.json");
const app = JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','app.json'), 'utf8'));
app.expo.version = version;
app.expo.ios = { ...app.expo.ios, buildNumber: String(Number(app.expo.ios?.buildNumber ?? 0) + 1) };
fs.writeFileSync(require('path').join(__dirname,'..','app.json'), JSON.stringify(app, null, 2) + '\n');
console.log(`app.json → ${version} (Build ${app.expo.ios.buildNumber})`);
