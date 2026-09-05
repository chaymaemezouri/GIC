const fs = require('fs');
const path = require('path');

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, files);
    else if (/\.(tsx|ts)$/.test(name) && !p.includes('dialog.ts') && !p.includes('DialogProvider')) files.push(p);
  }
  return files;
}

const root = path.join(process.cwd(), 'src');
const files = walk(root);
let changed = 0;

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;
  if (!/\b(alert|confirm|window\.confirm)\(/.test(src)) continue;

  const rel = path.relative(path.dirname(file), path.join(root, 'lib', 'dialog')).replace(/\\/g, '/');
  const importPath = rel.startsWith('.') ? rel : './' + rel;
  const importLine = `import { appAlert, appConfirm } from '${importPath.replace(/\.ts$/, '')}';\n`;

  if (!src.includes("from '../lib/dialog'") && !src.includes('from "../lib/dialog"')) {
    const m = src.match(/^import .+;\n/m);
    if (m) {
      const idx = src.indexOf(m[0]) + m[0].length;
      src = src.slice(0, idx) + importLine + src.slice(idx);
    } else {
      src = importLine + src;
    }
  }

  src = src.replace(/window\.confirm\(/g, 'await appConfirm(');
  src = src.replace(/([^a-zA-Z]|^)confirm\(/g, '$1await appConfirm(');
  src = src.replace(/([^a-zA-Z]|^)alert\(/g, '$1await appAlert(');
  src = src.replace(/await await /g, 'await ');

  if (src !== orig) {
    fs.writeFileSync(file, src);
    changed++;
    console.log('updated', path.relative(root, file));
  }
}
console.log('total', changed);
