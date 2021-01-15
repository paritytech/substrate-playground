import crypto from 'crypto';
import terms from 'bundle-text:./terms.md';

const termsApprovedKey = 'termsApproved';

function hash(s: string): string {
    return crypto.createHash('md5').update(s).digest('hex');
}

export function approved(): boolean {
  const approvedTermsHash = localStorage.getItem(termsApprovedKey);
  return hash(terms) == approvedTermsHash;
}

export function approve(): void {
    localStorage.setItem(termsApprovedKey, hash(terms));
}

export { terms };
