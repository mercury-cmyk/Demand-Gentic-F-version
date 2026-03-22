import fs from 'fs';
let code = fs.readFileSync('client/src/pages/landing.tsx', 'utf8');
code = code.replace(
  /\s*The Problem/g,
  ''
);
fs.writeFileSync('client/src/pages/landing.tsx', code);
console.log('Removed from menu using Regex');