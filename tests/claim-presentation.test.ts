import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

// Exercise the actual JSX, replacing only remote state and inventory boundaries.
const require = createRequire(import.meta.url);
const url = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
function compile(path: string, replacements: Record<string,string>) {
  let source = readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import ['"].*\.css['"];?$/gm,'');
  source = source.replace(/from (['"])([^'"]+)\1/g,(_,q,name)=>`from ${q}${replacements[name] ?? pathToFileURL(require.resolve(name)).href}${q}`);
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
    .replace(/from "react\/jsx-runtime"/g,`from "${pathToFileURL(require.resolve('react/jsx-runtime')).href}"`);
  return url(output);
}
const badge=compile('../src/components/entity/VerifiedBadge.tsx',{});
const inventory=url(`export const discoveryRepository={list:()=>['event','market','business'].map(kind=>({id:kind+'-test',kind}))};`);
for(const verified of [false,true]) {
  const state=url(`export const useVerifiedListing=()=>${verified};`);
  const component=await import(compile('../src/components/entity/ClaimCta.tsx',{'../../data/discovery':inventory,'../../lib/claimsApi':state,'./VerifiedBadge':badge}));
  for(const kind of ['event','market','business']) it(`${verified?'approved':'unclaimed'} ${kind} has consistent badge and claim presentation`,()=>{
    const html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement('div',null,
      createElement(component.VerifiedMark,{entityId:kind+'-test'}),createElement(component.ClaimCta,{entityId:kind+'-test',kind,title:'Test'}))));
    if(verified){assert.match(html,/Confirmed by the organization/);assert.match(html,/Suggest a correction/);assert.match(html,/Claimed by the organization/);assert.doesNotMatch(html,/Is this your|Claim it free|given more weight/);assert.doesNotMatch(html,/Claim this listing|href="\/claim\//);}
    else{assert.match(html,new RegExp(`href="/claim/${kind}-test"`));assert.match(html,/Claim this listing/);assert.doesNotMatch(html,/>Verified</);}
  });
  it(`missing entities cannot produce a claim link (${verified})`,()=>{
    const html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(component.ClaimCta,{entityId:'does-not-exist',kind:'business',title:'Missing'})));assert.equal(html,'');
  });
}
