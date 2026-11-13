import {
  BalancesResponse,
  Expense,
  Flat,
  FlatMember,
  Pagination,
  User,
} from '../types/index.js';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export class ApiClientError extends Error {
  public code: string;
  public details: Record<string, string>;
  public status: number;

  constructor(status: number, code: string, message: string, details: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(
  endpoint: string,
  userId?: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (userId) {
    headers['X-User-Id'] = userId;
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errorObj = data.error || {};
    throw new ApiClientError(
      res.status,
      errorObj.code || 'UNKNOWN_ERROR',
      errorObj.message || `Request failed with status ${res.status}`,
      errorObj.details || {}
    );
  }

  return data;
}

export const api = {
  // Demo Users
  getDemoUsers: () => request<{ data: User[] }>('/demo-users'),

  // Flats
  getFlats: (userId: string) => request<{ data: Flat[] }>('/flats', userId),

  getMembers: (flatId: string, userId: string) =>
    request<{ data: FlatMember[] }>(`/flats/${flatId}/members`, userId),

  leaveFlat: (flatId: string, userId: string) =>
    request<{ message: string; data: unknown }>(`/flats/${flatId}/leave`, userId, {
      method: 'POST',
    }),

  // Expenses
  getExpenses: (flatId: string, userId: string, page = 1, limit = 10) =>
    request<{ data: Expense[]; pagination: Pagination }>(
      `/flats/${flatId}/expenses?page=${page}&limit=${limit}`,
      userId
    ),

  createExpense: (
    flatId: string,
    userId: string,
    payload: {
      description: string;
      amountPaise: number;
      paidByUserId: string;
      splitBetweenUserIds: string[];
    }
  ) =>
    request<{ message: string; data: Expense }>(`/flats/${flatId}/expenses`, userId, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateExpense: (
    flatId: string,
    expenseId: string,
    userId: string,
    payload: {
      description: string;
      amountPaise: number;
      paidByUserId: string;
      splitBetweenUserIds: string[];
    }
  ) =>
    request<{ message: string; data: Expense }>(
      `/flats/${flatId}/expenses/${expenseId}`,
      userId,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),

  deleteExpense: (flatId: string, expenseId: string, userId: string) =>
    request<{ message: string; id: string }>(
      `/flats/${flatId}/expenses/${expenseId}`,
      userId,
      {
        method: 'DELETE',
      }
    ),

  // Balances
  getBalances: (flatId: string, userId: string) =>
    request<{ data: BalancesResponse }>(`/flats/${flatId}/balances`, userId),
};
