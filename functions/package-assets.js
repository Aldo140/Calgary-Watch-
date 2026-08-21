const { copyFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const source = join(__dirname, '..', 'public', 'images', 'email', 'logo.png');
const outputDirectory = join(__dirname, 'assets');
const destination = join(outputDirectory, 'logo.png');

mkdirSync(outputDirectory, { recursive: true });
copyFileSync(source, destination);
console.log('Packaged the Calgary Watch primary inline email logo.');
