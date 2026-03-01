import fs from 'fs';
let code = fs.readFileSync('client/src/pages/landing.tsx', 'utf8');
code = code.replace(
  /\s*<a href=\"#the-problem\" className=\"text-sm font-medium text-muted-foreground hover:text-foreground transition-colors\" role=\"menuitem\">The Problem<\/a>/g,
  ''
);
fs.writeFileSync('client/src/pages/landing.tsx', code);
console.log('Removed from menu using Regex');
