import terms from 'bundle-text:./terms.md';

const termsApprovedKey = 'termsApproved';

function hash(s: string): string {
    return Array.from(s).reduce((hash, char) => 0 | (31 * hash + char.charCodeAt(0)), 0).toString();
}

export function approved(): boolean {
  const approvedTermsHash = localStorage.getItem(termsApprovedKey);
  return hash(terms) == approvedTermsHash;
}

export function approve(): void {
    localStorage.setItem(termsApprovedKey, hash(terms));
}

export { terms };
