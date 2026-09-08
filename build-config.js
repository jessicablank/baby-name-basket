// Generates config.js at build time from environment variables.
// Vercel clones the repo without config.js (it's gitignored), so this recreates it.
const fs = require('fs');

const required = ['SHEETS_WEB_APP_URL', 'SHEETS_TOKEN'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(`Missing environment variable(s): ${missing.join(', ')}`);
  console.error('Set them with: vercel env add <NAME>');
  process.exit(1);
}

const config = {
  SHEETS_WEB_APP_URL: process.env.SHEETS_WEB_APP_URL,
  SHEETS_TOKEN: process.env.SHEETS_TOKEN,
};

fs.writeFileSync('config.js', `window.APP_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
console.log('Wrote config.js');
