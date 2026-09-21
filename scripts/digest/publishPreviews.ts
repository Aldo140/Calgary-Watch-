// Portable equivalent of POSIX `DIGEST_PREVIEW_DIR=... tsx ...` for Windows CI/dev.
process.env.DIGEST_PREVIEW_DIR = 'dist/email-previews';
await import('./preview');
export {};
