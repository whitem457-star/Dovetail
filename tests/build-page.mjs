// Builds the app's page the same way as Gradle's :app:generatePaydayPage (app/build.gradle.kts), for machines
// without the Android SDK (cloud sessions): template.html with the five scripts inlined, in order, inside one
// function scope, plus fonts/, written to app/build/generated/payday-assets/. Keep the two in step.
import fs from 'fs';
import path from 'path';

const root = new globalThis.URL('..', import.meta.url).pathname;
const out = path.join(root, 'app/build/generated/payday-assets');
const marker = '/*PAYDAY_SCRIPTS*/';
const page = fs.readFileSync(path.join(root, 'web/template.html'), 'utf8');
if (page.split(marker).length !== 2) throw new Error('web/template.html must contain ' + marker + ' exactly once');
const scripts = ['calc.js', 'migrate.js', 'analysis.js', 'export.js', 'ui.js'].map(name => {
  const text = fs.readFileSync(path.join(root, 'web/src', name), 'utf8');
  if (/<\/script/i.test(text)) throw new Error('web/src/' + name + ' must not contain </script');
  return '/* ===== ' + name + ' ===== */\n' + text;
}).join('\n');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'web/fonts'), path.join(out, 'fonts'), { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), page.split(marker).join('(function(){\n"use strict";\n' + scripts + '\n})();'));
console.log('Built ' + path.relative(root, path.join(out, 'index.html')));
