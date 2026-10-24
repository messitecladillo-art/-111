import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {COMPETITION_UPDATE} from '../data/competition-update.ts';
const root=new URL('../../../',import.meta.url);
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));

test('current official-source review preserves edition17 and unresolved exact scope',()=>{
 const record=read(COMPETITION_UPDATE.lastAttempt.evidencePath);
 assert.equal(record.record_kind,'source-review-not-rule-snapshot');
 assert.equal(record.verified_at,COMPETITION_UPDATE.verifiedAt);
 assert.equal(record.verified_at,COMPETITION_UPDATE.lastAttempt.date);
 assert.equal(record.confirmed_scope.edition,COMPETITION_UPDATE.edition);
 for(const field of ['group','region','track','stage'])assert.equal(record.confirmed_scope[field],null);
 assert.equal(COMPETITION_UPDATE.status,'general_notice_only');assert.equal(COMPETITION_UPDATE.fullRuleSnapshotAvailable,false);
 assert.equal(record.notice_index.format_notice_in_retrieved_index,false);
 assert.match(record.notice_index.completeness,/只核验/);
});

test('notice provenance binds archived bytes without promoting school format to national rule',()=>{
 const record=read(COMPETITION_UPDATE.lastAttempt.evidencePath);
 const bytes=readFileSync(new URL(record.general_notice.existing_local_pdf,root));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),record.general_notice.sha256);
 assert.equal(record.local_reference.id,'btbu-17-report-layout-v1');
 assert.match(record.local_reference.use,/参考/);
 assert.match(record.general_notice.facts[0].text,/2026年11月17日/);
 // Hash linkage checks stored evidence. It does not perform a new web verification.
});
