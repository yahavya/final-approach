import { allTests } from './sim-tests.js?v=e179301';

const results = allTests();
let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  print(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}
print(`\n${results.length - failed}/${results.length} passed`);
