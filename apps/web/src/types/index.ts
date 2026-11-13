export interface User {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
  memberships?: {
    flatId: string;
    flatName: string;
    joinedAt: string;
    leftAt: string | null;
    isActive: boolean;
  }[];
}

export interface Flat {
  id: string;
  name: string;
  createdAt: string;
  isMember?: boolean;
  hasLeft?: boolean;
  joinedAt?: string;
  leftAt?: string | null;
}

export interface FlatMember {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  leftAt: string | null;
  hasLeft: boolean;
}

export interface ExpenseShare {
  userId: string;
  userName: string;
  userEmail: string;
  amountPaise: number;
}

export interface Expense {
  id: string;
  flatId: string;
  description: string;
  amountPaise: number;
  createdAt: string;
  updatedAt: string;
  paidBy: {
    id: string;
    name: string;
    email: string;
  };
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  shares: ExpenseShare[];
  isCreator: boolean;
}

export interface MemberBalance {
  userId: string;
  userName: string;
  userEmail: string;
  joinedAt: string;
  leftAt: string | null;
  hasLeft: boolean;
  totalPaidPaise: number;
  totalSharePaise: number;
  netBalancePaise: number;
}

export interface SettlementSuggestion {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amountPaise: number;
  formattedText: string;
}

export interface BalancesResponse {
  totalSpendingPaise: number;
  balances: MemberBalance[];
  settlements: SettlementSuggestion[];
}

export interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}
