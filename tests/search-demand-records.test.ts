import assert from 'node:assert/strict';
import {test} from 'node:test';
import {demandQuery,isFreshSearch,readDemandRecords,REPEAT_WINDOW_MS,summarizeDemand} from '../src/lib/searchDemand';
import {describeAnswer,parseSearchIntent} from '../src/lib/searchIntent';
test('malformed analytics cannot reach term rendering or intent parsing',()=>{
 const invalid=[null,{}, {q:17,results:0,ts:1},{q:{term:'markets'},results:0,ts:1},{q:'markets',results:{count:0},ts:1},{q:'markets',results:NaN,ts:1},{q:'markets',results:0,ts:Infinity},{q:'markets',results:-1,ts:1},{q:'markets',results:0.5,ts:1},{q:'',results:0,ts:1}];
 const {rows,ignored}=readDemandRecords([...invalid,{q:'  JAZZ   night ',results:0,ts:1},{q:'jazz night',results:2,ts:2}]);
 assert.equal(ignored,invalid.length);assert.equal(rows.length,2);assert.deepEqual(summarizeDemand(rows),[{q:'jazz night',searches:2,lastResults:2,lastAt:2}]);
 for(const row of rows)assert.doesNotThrow(()=>describeAnswer(parseSearchIntent(row.q)));
});
test('valid missed searches keep their query links and current-answer previews',()=>{
 const words=['panorama hills','seton','applestone place','coppersome close','yesterday police','why so much police active tonight','helicopter circling coral springs','comedy festivals','local markets'];
 const parsed=readDemandRecords(words.map((q,i)=>({q,results:0,ts:i+1})));
 assert.equal(parsed.ignored,0);assert.equal(summarizeDemand(parsed.rows).length,words.length);
 for(const row of parsed.rows)assert.doesNotThrow(()=>describeAnswer(parseSearchIntent(row.q)));
});
test('unsupported and contact-shaped records are counted as excluded',()=>{
 const parsed=readDemandRecords([{q:'hello@example.org',results:0,ts:1},{q:'markets',results:1000,ts:1},{q:'markets',results:0,ts:0}]);assert.equal(parsed.ignored,3);assert.deepEqual(parsed.rows,[]);
});

test('a pasted paragraph is never kept as a search',()=>{
  assert.equal(demandQuery('work in the calgarywatch repository on the current production branch. this task'),null);
  assert.equal(demandQuery('why so much police active tonight'),'why so much police active tonight');
});

test('the same words from one tab count again after half an hour, not on a quick repeat',()=>{
  const t0=1_000_000;
  assert.equal(isFreshSearch({},'hex',t0),true);
  assert.equal(isFreshSearch({hex:t0},'hex',t0+60_000),false);
  assert.equal(isFreshSearch({hex:t0},'hex',t0+REPEAT_WINDOW_MS),true);
  assert.equal(isFreshSearch({hex:t0},'ogden',t0+1),true);
});
