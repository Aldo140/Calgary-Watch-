import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AttentionQueue} from '../src/components/admin/AttentionQueue';
const props={flagged:[],pendingReview:[],apiHealths:[],onRestore(){},onDelete(){},onApprove(){},onHide(){},restoringId:null,deletingId:null};
test('unknown queues never announce that the desk is clear',()=>{for(const emptyStatus of ['loading','unavailable'] as const){const html=renderToStaticMarkup(React.createElement(AttentionQueue,{...props,emptyStatus}));assert.ok(!html.includes('title="Desk is clear"'));assert.ok(!html.includes('>Desk is clear<'));assert.match(html,emptyStatus==='loading'?/Checking for work/:/Unable to confirm/);}});
test('successfully checked empty queues can be clear',()=>{assert.match(renderToStaticMarkup(React.createElement(AttentionQueue,{...props,emptyStatus:'clear'})),/>Desk is clear</);});
