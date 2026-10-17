const { copyFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const source = join(__dirname, '..', 'public', 'images', 'email', 'logo.png');
const outputDirectory = join(__dirname, 'assets');
const destination = join(outputDirectory, 'logo.png');

mkdirSync(outputDirectory, { recursive: true });
copyFileSync(source, destination);
console.log('Packaged the Calgary Watch primary inline email logo.');

require('esbuild').buildSync({entryPoints:[join(__dirname,'..','scripts','claims','organization-submit.ts')],outfile:join(__dirname,'organization-submit.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external'});
require('esbuild').buildSync({entryPoints:[join(__dirname,'..','scripts','claims','admin-member.ts')],outfile:join(__dirname,'admin-member.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external'});
require('esbuild').buildSync({entryPoints:[join(__dirname,'..','scripts','claims','approve-organization.ts')],outfile:join(__dirname,'approve-organization.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external'});
