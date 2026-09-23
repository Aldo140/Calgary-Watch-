const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.css') || file.endsWith('.json')) {
      results.push(fullPath);
    }
  });
  return results;
}

const files = walk('src');
const imgRegex = /['"`]((?:\/|(?:\.\.\/)*)?images\/[a-zA-Z0-9_\-\.\/]+?\.(?:webp|jpg|jpeg|png|svg|gif))['"`]/g;
const missing = [];
const found = new Set();

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  let match;
  while ((match = imgRegex.exec(content)) !== null) {
    const rawPath = match[1];
    found.add(rawPath);
    const cleanPath = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
    const pubPath = path.join('public', cleanPath);
    if (!fs.existsSync(pubPath)) {
      missing.push({ file: f, image: rawPath, expected: pubPath });
    }
  }
});

console.log('Total unique image paths checked:', found.size);
console.log('Missing images count:', missing.length);
missing.forEach(m => console.log('MISSING:', m.image, 'referenced in', path.relative(process.cwd(), m.file)));
