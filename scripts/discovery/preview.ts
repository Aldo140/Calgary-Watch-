/**
 * Local preview: runs the same build-time export without Firestore, so the dev server
 * shows every current event and market. Equivalent to `npm run discovery:export` with no
 * credentials set.
 *
 *   npm run discovery:preview
 */
delete process.env.FIREBASE_SERVICE_ACCOUNT;
await import('./export');
