import fs from 'fs';
let code = fs.readFileSync('client/src/pages/landing.tsx', 'utf8');
code = code.replace(
  '<a href="#problems-we-solve" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" role="menuitem">Problems We Solve</a>',
  '<a href="#the-problem" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" role="menuitem">The Problem</a>'
);
code = code.replace(
  'id="problems-we-solve"',
  'id="the-problem"'
);
fs.writeFileSync('client/src/pages/landing.tsx', code);
console.log('Revisions applied.');
