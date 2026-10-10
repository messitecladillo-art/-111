import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {COMPETITION_UPDATE} from '../data/competition-update.ts';
const root=new URL('../../../',import.meta.url);
const recordPath=COMPETITION_UPDATE.lastAttempt.evidencePath;
const read=path=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
test('bounded source attempt stays separate from canonical rule verification and edition scope',()=>{
 const record=read(recordPath),prior=read(COMPETITION_UPDATE.evidencePath);
 assert.equal(record.record_kind,'source-attempt-not-a-rule-snapshot');
 assert.equal(record.attempted_at,COMPETITION_UPDATE.lastAttempt.date);assert.equal(record.edition,COMPETITION_UPDATE.edition);
 assert.equal(COMPETITION_UPDATE.verifiedAt,prior.verified_at);assert.equal(record.preserved_verified_at,prior.verified_at);
 assert.equal(COMPETITION_UPDATE.status,'general_notice_only');assert.equal(COMPETITION_UPDATE.fullRuleSnapshotAvailable,false);
 assert.equal(record.organizer.latest_notice_completeness,'unknown');assert.equal(record.republication.pdf,COMPETITION_UPDATE.source);
});
test('attempt record references unchanged local bounded evidence, not a fabricated full crawl',()=>{
 const record=read(recordPath),evidence=record.evidence;
 assert.match(evidence.path,/^corpus-source\/official-rules\/[a-z0-9-]+\.json$/);
 const bytes=readFileSync(new URL(evidence.path,root));assert.equal(createHash('sha256').update(bytes).digest('hex'),evidence.sha256);
 const parsed=JSON.parse(bytes);assert.equal(parsed.kind,'bounded-official-source-extraction');
 assert(parsed.attempts.some(a=>a.url.includes('china-cssc.org')&&a.outcome==='inaccessible'));
 assert(parsed.attempts.some(a=>a.url===COMPETITION_UPDATE.source&&a.outcome==='pdf_body_read'));
 // This checks internal evidence linkage only, not current network or official authenticity.
});
