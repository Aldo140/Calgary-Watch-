import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {claimPresentation} from '../src/lib/claimPresentation';
import type {DiscoveryEntity} from '../src/types/discovery';
const all=JSON.parse(readFileSync('src/generated/discovery-index.json','utf8')).entities as DiscoveryEntity[];
test('claim categories adapt to market, performing arts, music, food and community organizations',()=>{
 for(const [id,key] of [['biz-downstage','stage'],['a35b908bde4fec3931fc15d01eb8','music'],['biz-calgary-farmers-market','market'],['biz-rosso-inglewood','food'],['biz-dalhousie-community-association','community'],['biz-contemporary-calgary','arts']]){
  const entity=all.find(e=>e.id===id)!;assert.ok(entity);assert.equal(claimPresentation(entity).key,key,id);
 }
});
test('market identity wins over its food categories and a host organization cannot override listing context',()=>{
 const market=all.find(e=>e.kind==='market')!;
 assert.equal(claimPresentation(market).key,'market');
 assert.equal(claimPresentation(market,all.find(e=>e.id==='biz-downstage')).key,'market');
});
test('every published claimable listing has category copy and a relevant note prompt without changing identity',()=>{
 for(const entity of all.filter(e=>['market','business','event'].includes(e.kind))){
  const before=JSON.stringify(entity);const view=claimPresentation(entity);assert.ok(view.label&&view.detail&&view.placeholder&&view.dates&&view.link);assert.equal(JSON.stringify(entity),before);
 }
});
