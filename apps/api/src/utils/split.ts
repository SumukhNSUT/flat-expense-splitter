import { ApiError } from '../errors/ApiError.js';

export interface SplitShare {
  userId: string;
  amountPaise: number;
}

/**
 * Calculates equal split shares using pure integer arithmetic.
 * Guarantees that the sum of all individual shares equals totalPaise EXACTLY.
 *
 * Algorithm:
 * 1. Validate totalPaise is a positive integer and userIds is non-empty with no duplicates.
 * 2. Sort userIds lexicographically to guarantee deterministic allocation across all runs.
 * 3. Base share per participant = totalPaise / N (integer division).
 * 4. Remainder paise = totalPaise % N (where 0 <= remainder < N).
 * 5. Allocate 1 additional paise to the first `remainder` participants in the deterministic order.
 * 6. Allocate `baseShare` to the remaining participants.
 */
export function calculateEqualSplit(
  totalPaise: number | bigint,
  userIds: string[]
): SplitShare[] {
  const total = BigInt(totalPaise);

  if (total <= 0n) {
    throw ApiError.badRequest('Total amount must be greater than zero.');
  }

  if (!userIds || userIds.length === 0) {
    throw ApiError.badRequest('At least one participant must be selected for the split.');
  }

  const uniqueUsers = new Set(userIds);
  if (uniqueUsers.size !== userIds.length) {
    throw ApiError.badRequest('Duplicate participants are not allowed in the split.');
  }

  // Deterministic ordering: sort user IDs lexicographically
  const sortedUserIds = [...userIds].sort();
  const count = BigInt(sortedUserIds.length);

  const baseShare = total / count;
  const remainder = Number(total % count);

  const shares: SplitShare[] = sortedUserIds.map((userId, index) => {
    const amount = index < remainder ? baseShare + 1n : baseShare;
    return {
      userId,
      amountPaise: Number(amount),
    };
  });

  // Verification invariant: sum of shares must equal totalPaise
  const sumShares = shares.reduce((acc, curr) => acc + BigInt(curr.amountPaise), 0n);
  if (sumShares !== total) {
    throw ApiError.internal(`Splitting invariant failed: sum of shares (${sumShares}) != total (${total})`);
  }

  return shares;
}

export interface SettlementSuggestion {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amountPaise: number;
  formattedText: string;
}

/**
 * Deterministically computes optimal settlement suggestions between debtors and creditors
 * using a greedy matching algorithm.
 *
 * Invariant: Sum of net balances across the flat equals 0.
 * Zero-sum guaranteed; never alters underlying database state or introduces fractions.
 */
export function calculateSettlements(
  members: {
    userId: string;
    userName: string;
    netBalancePaise: number;
  }[]
): SettlementSuggestion[] {
  // Debtors owe money (netBalance < 0), Creditors are owed money (netBalance > 0)
  const debtors = members
    .filter((m) => m.netBalancePaise < 0)
    .map((m) => ({ ...m, remainingOwed: -m.netBalancePaise }))
    .sort((a, b) => b.remainingOwed - a.remainingOwed || a.userId.localeCompare(b.userId));

  const creditors = members
    .filter((m) => m.netBalancePaise > 0)
    .map((m) => ({ ...m, remainingOwed: m.netBalancePaise }))
    .sort((a, b) => b.remainingOwed - a.remainingOwed || a.userId.localeCompare(b.userId));

  const suggestions: SettlementSuggestion[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];

    const settleAmount = Math.min(debtor.remainingOwed, creditor.remainingOwed);
    if (settleAmount > 0) {
      const rupees = (settleAmount / 100).toFixed(2);
      suggestions.push({
        fromUserId: debtor.userId,
        fromUserName: debtor.userName,
        toUserId: creditor.userId,
        toUserName: creditor.userName,
        amountPaise: settleAmount,
        formattedText: `${debtor.userName} owes ${creditor.userName} ₹${rupees}`,
      });

      debtor.remainingOwed -= settleAmount;
      creditor.remainingOwed -= settleAmount;
    }

    if (debtor.remainingOwed === 0) dIdx++;
    if (creditor.remainingOwed === 0) cIdx++;
  }

  return suggestions;
}
