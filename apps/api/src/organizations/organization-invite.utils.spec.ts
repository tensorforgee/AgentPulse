import {
  createOrganizationInviteToken,
  digestOrganizationInviteToken,
} from './organization-invite.utils';

describe('organization invitation tokens', () => {
  it('creates high-entropy, URL-safe, unique tokens', () => {
    const first = createOrganizationInviteToken();
    const second = createOrganizationInviteToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it('stores a deterministic digest rather than the raw token', () => {
    const token = createOrganizationInviteToken();
    const digest = digestOrganizationInviteToken(token);

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(token);
    expect(digestOrganizationInviteToken(token)).toBe(digest);
  });
});
