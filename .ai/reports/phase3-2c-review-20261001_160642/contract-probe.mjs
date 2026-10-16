import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const repo=process.cwd();
const {CANONICAL_8_ACTIONS,AssertionCollector}=await import(pathToFileURL(path.join(repo,'scripts/ui-checks/access-history-shared.mjs')));
const {accessLogActionLabels}=await import(pathToFileURL(path.join(repo,'dist/server/shared/domain/access-log.js')));
const collector=new AssertionCollector('sol-unregistered-case');
collector.validateRequiredCoverage();
const result={
  labelMismatches:CANONICAL_8_ACTIONS.filter(item=>accessLogActionLabels[item.actionType]!==item.label).map(item=>({actionType:item.actionType,expected:accessLogActionLabels[item.actionType],actual:item.label})),
  unknownCaseEmptyCoverageAccepted:true,
  knownRequiredCases:Object.keys((await import(pathToFileURL(path.join(repo,'scripts/ui-checks/access-history-shared.mjs')))).REQUIRED_ASSERTIONS),
};
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'contract-probe.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
