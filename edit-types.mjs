const fs = require('fs');

// 1a. fti.ts - add canWithdrawStatus
let p = 'src/types/fti.ts';
let c = fs.readFileSync(p, 'utf8');
c = c.replace(
  /export function isEditableStatus[^}]+\}/,
  `export function isEditableStatus(status: string): boolean {
  const upper = status.toUpperCase();
  return upper === "DRAFT" || upper === "REQUESTED_FOR_CHANGE";
}

/**
 * Returns true when the submitter can withdraw (unsubmit) the request
 * themselves - i.e. it has been sent but no approver has acted yet.
 * Admins can force-withdraw even after an approver has acted.
 */
export function canWithdrawStatus(status: string): boolean {
  const upper = status.toUpperCase();
  return upper === "SENT" || upper === "SUBMITTED";
}`
);
fs.writeFileSync(p, c);
console.log('OK: fti.ts');
