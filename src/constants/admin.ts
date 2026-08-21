export const ALLOWED_ADMIN_EMAILS = [
  'jorti104@mtroyal.ca',
  'ophillah1863@gmail.com',
];

export function isApprovedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWED_ADMIN_EMAILS.includes(email.toLowerCase());
}
