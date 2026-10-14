import { describe, it, expect } from 'vitest';
import { matchSlaRequestStaffScope, SlaScopeMode } from '../components/AnalyticsView';

describe('TAT and SLAs Staff Scoping (Me / All / Custom)', () => {
  const currentUser = {
    id: 'user-pnc-1',
    name: 'Nitin Desk',
    email: 'nitin@navgurukul.org',
  };

  const reqAssignedToMe = {
    assignedPncId: 'user-pnc-1',
    assignedUserName: 'Nitin Desk',
    initialHandlerName: 'Nitin Desk',
    currentHandlerName: 'Nitin Desk',
    stages: [{ actorName: 'Nitin Desk', actorId: 'user-pnc-1' }],
    hasHandover: false,
  };

  const reqClaimedByOther = {
    assignedPncId: 'user-pnc-2',
    assignedUserName: 'Asha Sharma',
    initialHandlerName: 'Asha Sharma',
    currentHandlerName: 'Asha Sharma',
    stages: [{ actorName: 'Asha Sharma', actorId: 'user-pnc-2' }],
    hasHandover: false,
  };

  const reqHandedOverToMe = {
    assignedPncId: 'user-pnc-1',
    assignedUserName: 'Nitin Desk',
    initialHandlerName: 'Ravi Patel',
    currentHandlerName: 'Nitin Desk',
    stages: [
      { actorName: 'Ravi Patel', actorId: 'user-pnc-3' },
      { actorName: 'Nitin Desk', actorId: 'user-pnc-1' },
    ],
    hasHandover: true,
  };

  const reqUnassigned = {
    assignedPncId: undefined,
    assignedUserName: 'Unassigned',
    initialHandlerName: 'Unassigned',
    currentHandlerName: 'Unassigned',
    stages: [],
    hasHandover: false,
  };

  describe("Mode: 'all'", () => {
    it('returns true for all requests regardless of handler', () => {
      expect(matchSlaRequestStaffScope(reqAssignedToMe, 'all', [], currentUser)).toBe(true);
      expect(matchSlaRequestStaffScope(reqClaimedByOther, 'all', [], currentUser)).toBe(true);
      expect(matchSlaRequestStaffScope(reqHandedOverToMe, 'all', [], currentUser)).toBe(true);
      expect(matchSlaRequestStaffScope(reqUnassigned, 'all', [], currentUser)).toBe(true);
    });
  });

  describe("Mode: 'me'", () => {
    it('includes requests assigned directly to current user ID', () => {
      expect(matchSlaRequestStaffScope(reqAssignedToMe, 'me', [], currentUser)).toBe(true);
    });

    it('includes requests handed over to or touched by current user in stages', () => {
      expect(matchSlaRequestStaffScope(reqHandedOverToMe, 'me', [], currentUser)).toBe(true);
    });

    it('excludes requests handled exclusively by other staff members', () => {
      expect(matchSlaRequestStaffScope(reqClaimedByOther, 'me', [], currentUser)).toBe(false);
    });

    it('excludes unassigned requests when in me mode', () => {
      expect(matchSlaRequestStaffScope(reqUnassigned, 'me', [], currentUser)).toBe(false);
    });

    it('matches case-insensitively on name or email', () => {
      const reqCase = {
        assignedPncId: 'other-id',
        assignedUserName: 'nitin desk',
        initialHandlerName: 'nitin desk',
        currentHandlerName: 'nitin desk',
        stages: [],
      };
      expect(matchSlaRequestStaffScope(reqCase, 'me', [], currentUser)).toBe(true);
    });
  });

  describe("Mode: 'custom' (multiselect)", () => {
    it('matches single selected staff member', () => {
      expect(matchSlaRequestStaffScope(reqClaimedByOther, 'custom', ['Asha Sharma'], currentUser)).toBe(true);
      expect(matchSlaRequestStaffScope(reqAssignedToMe, 'custom', ['Asha Sharma'], currentUser)).toBe(false);
    });

    it('matches any handler in a multi-select array', () => {
      const selected = ['Asha Sharma', 'Ravi Patel'];
      // reqClaimedByOther has Asha Sharma
      expect(matchSlaRequestStaffScope(reqClaimedByOther, 'custom', selected, currentUser)).toBe(true);
      // reqHandedOverToMe had initialHandlerName Ravi Patel
      expect(matchSlaRequestStaffScope(reqHandedOverToMe, 'custom', selected, currentUser)).toBe(true);
      // reqAssignedToMe has only Nitin Desk
      expect(matchSlaRequestStaffScope(reqAssignedToMe, 'custom', selected, currentUser)).toBe(false);
    });

    it('supports special filter for mid-way handovers only', () => {
      expect(matchSlaRequestStaffScope(reqHandedOverToMe, 'custom', ['handovers'], currentUser)).toBe(true);
      expect(matchSlaRequestStaffScope(reqAssignedToMe, 'custom', ['handovers'], currentUser)).toBe(false);
    });

    it('supports special filter for unassigned pool', () => {
      expect(matchSlaRequestStaffScope(reqUnassigned, 'custom', ['unassigned'], currentUser)).toBe(true);
      expect(matchSlaRequestStaffScope(reqAssignedToMe, 'custom', ['unassigned'], currentUser)).toBe(false);
    });

    it('falls back to all when custom array is empty', () => {
      expect(matchSlaRequestStaffScope(reqAssignedToMe, 'custom', [], currentUser)).toBe(true);
      expect(matchSlaRequestStaffScope(reqClaimedByOther, 'custom', [], currentUser)).toBe(true);
    });
  });
});
