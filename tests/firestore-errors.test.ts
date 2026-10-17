import assert from 'node:assert/strict';
import {test} from 'node:test';
import {firestoreActionError,adminFirestoreActionError,isFirestorePermissionError} from '../src/lib/firestoreErrors';
test('permission failures identify access and deployed rules without raw SDK text',()=>{
 for(const e of [{code:'firestore/permission-denied'},Error('Missing or insufficient permissions.')]){assert.ok(isFirestorePermissionError(e));assert.match(adminFirestoreActionError(e),/administrator account/);assert.match(adminFirestoreActionError(e),/current Firestore rules/);assert.doesNotMatch(firestoreActionError(e),/administrator|deploy/);}
});
test('internal callable errors do not expose internal [0] or falsely promise rollback',()=>{
 for(const e of [{code:'functions/internal'},Error('internal [0]'),{code:'functions/not-found'}]){const message=firestoreActionError(e,true);assert.match(message,/Refresh to check its status/);assert.doesNotMatch(message,/internal \[0\]|No changes were applied/);}
});
test('specific validation errors remain actionable',()=>{
 assert.equal(firestoreActionError(Error('The claimant has no matching user profile.')),'The claimant has no matching user profile.');
});
