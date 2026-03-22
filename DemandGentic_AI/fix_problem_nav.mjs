import fs from 'fs';
let code = fs.readFileSync('client/src/pages/landing.tsx', 'utf8');
code = code.replace(
  'Problems We Solve',
  'The Problem'
);
code = code.replace(
  'id="problems-we-solve"',
  'id="the-problem"'
);
fs.writeFileSync('client/src/pages/landing.tsx', code);
console.log('Revisions applied.');