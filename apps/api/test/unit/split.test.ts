import { describe, it, expect } from 'vitest';
import { calculateEqualSplit, calculateSettlements } from '../../src/utils/split.js';
import { ApiError } from '../../src/errors/ApiError.js';

describe('Equal Split Algorithm (Pure Integer Arithmetic)', () => {
  const userA = '00000000-0000-0000-0000-000000000001';
  const userB = '00000000-0000-0000-0000-000000000002';
  const userC = '00000000-0000-0000-0000-000000000003';
  const userD = '00000000-0000-0000-0000-000000000004';

  it('splits evenly when total is a multiple of participant count', () => {
    const totalPaise = 10000; // ₹100.00
    const participants = [userA, userB, userC, userD];

    const shares = calculateEqualSplit(totalPaise, participants);

    expect(shares).toHaveLength(4);
    expect(shares.map((s) => s.amountPaise)).toEqual([2500, 2500, 2500, 2500]);
    const sum = shares.reduce((acc, s) => acc + s.amountPaise, 0);
    expect(sum).toBe(totalPaise);
  });

  it('handles uneven splits with 1 paise remainder deterministically', () => {
    // 100 paise between 3 participants: 34, 33, 33
    const totalPaise = 100;
    const participants = [userC, userA, userB]; // intentionally unsorted input

    const shares = calculateEqualSplit(totalPaise, participants);

    expect(shares).toHaveLength(3);
    const sum = shares.reduce((acc, s) => acc + s.amountPaise, 0);
    expect(sum).toBe(100);

    // Because userIds are sorted: userA gets 34, userB gets 33, userC gets 33
    const shareA = shares.find((s) => s.userId === userA);
    const shareB = shares.find((s) => s.userId === userB);
    const shareC = shares.find((s) => s.userId === userC);

    expect(shareA?.amountPaise).toBe(34);
    expect(shareB?.amountPaise).toBe(33);
    expect(shareC?.amountPaise).toBe(33);
  });

  it('allocates remainder paise one at a time up to remainder count', () => {
    // 7 paise across 5 participants: base = 1, remainder = 2. First two get 2, rest get 1.
    const users = [
      '11111111-0000-0000-0000-000000000001',
      '11111111-0000-0000-0000-000000000002',
      '11111111-0000-0000-0000-000000000003',
      '11111111-0000-0000-0000-000000000004',
      '11111111-0000-0000-0000-000000000005',
    ];

    const shares = calculateEqualSplit(7, users);
    expect(shares.map((s) => s.amountPaise)).toEqual([2, 2, 1, 1, 1]);
    expect(shares.reduce((acc, s) => acc + s.amountPaise, 0)).toBe(7);
  });

  it('is completely order-independent (deterministic tie-breaking)', () => {
    const total = 1000;
    const list1 = [userA, userB, userC];
    const list2 = [userC, userA, userB];
    const list3 = [userB, userC, userA];

    const res1 = calculateEqualSplit(total, list1);
    const res2 = calculateEqualSplit(total, list2);
    const res3 = calculateEqualSplit(total, list3);

    expect(res1).toEqual(res2);
    expect(res2).toEqual(res3);
  });

  it('rejects zero or negative amounts', () => {
    expect(() => calculateEqualSplit(0, [userA])).toThrow(ApiError);
    expect(() => calculateEqualSplit(-500, [userA])).toThrow(ApiError);
  });

  it('rejects empty participant list', () => {
    expect(() => calculateEqualSplit(100, [])).toThrow(ApiError);
  });

  it('rejects duplicate participants', () => {
    expect(() => calculateEqualSplit(100, [userA, userB, userA])).toThrow(ApiError);
  });

  it('never loses or creates a single paise across 1,000 distinct totals and participant counts', () => {
    // Property-based simulation over 1,000 combinations
    for (let i = 1; i <= 1000; i++) {
      // Random total between 1 paise and 100,000,000 paise (₹1,000,000.00)
      const total = Math.floor(Math.random() * 10000000) + 1;
      const participantCount = Math.floor(Math.random() * 15) + 1;

      const dummyUsers = Array.from({ length: participantCount }, (_, idx) =>
        `00000000-0000-0000-0000-${String(idx + 1).padStart(12, '0')}`
      );

      const shares = calculateEqualSplit(total, dummyUsers);

      // Invariant 1: Participant count matches
      expect(shares).toHaveLength(participantCount);

      // Invariant 2: Sum of shares strictly equals totalPaise
      const sum = shares.reduce((acc, s) => acc + s.amountPaise, 0);
      expect(sum).toBe(total);

      // Invariant 3: Difference between maximum and minimum share is at most 1 paise
      const amounts = shares.map((s) => s.amountPaise);
      const maxShare = Math.max(...amounts);
      const minShare = Math.min(...amounts);
      expect(maxShare - minShare).toBeLessThanOrEqual(1);
    }
  });
});

describe('Settlement Suggestion Algorithm', () => {
  it('correctly matches debtors and creditors with zero remaining balance', () => {
    const balances = [
      { userId: 'u1', userName: 'Sumukh', netBalancePaise: 45000 },  // owed ₹450
      { userId: 'u2', userName: 'Aarav', netBalancePaise: -45000 },  // owes ₹450
      { userId: 'u3', userName: 'Riya', netBalancePaise: 0 },        // settled
    ];

    const settlements = calculateSettlements(balances);
    expect(settlements).toHaveLength(1);
    expect(settlements[0]).toEqual({
      fromUserId: 'u2',
      fromUserName: 'Aarav',
      toUserId: 'u1',
      toUserName: 'Sumukh',
      amountPaise: 45000,
      formattedText: 'Aarav owes Sumukh ₹450.00',
    });
  });

  it('handles multi-party settlements correctly without rounding errors', () => {
    const balances = [
      { userId: 'u1', userName: 'Sumukh', netBalancePaise: 10000 }, // owed 100
      { userId: 'u2', userName: 'Aarav', netBalancePaise: 5000 },   // owed 50
      { userId: 'u3', userName: 'Riya', netBalancePaise: -15000 },  // owes 150
    ];

    const settlements = calculateSettlements(balances);
    expect(settlements).toHaveLength(2);

    const totalSettled = settlements.reduce((acc, s) => acc + s.amountPaise, 0);
    expect(totalSettled).toBe(15000);
  });
});
