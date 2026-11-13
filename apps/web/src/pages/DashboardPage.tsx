import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  Scale,
  Receipt,
  ArrowRight,
  Calendar,
  AlertCircle,
  Trash2,
  Edit2,
} from 'lucide-react';
import { Header } from '../components/layout/Header.js';
import { useApp } from '../context/AppContext.js';
import { api, ApiClientError } from '../services/api.js';
import { BalancesResponse, Expense } from '../types/index.js';
import { formatPaise } from '../utils/currency.js';
import { LoadingSpinner } from '../components/common/LoadingSpinner.js';
import { EmptyState } from '../components/common/EmptyState.js';
import { ConfirmDialog } from '../components/common/ConfirmDialog.js';

export const DashboardPage: React.FC = () => {
  const { currentFlat, currentUser, refreshKey, openAddExpense, openEditExpense, triggerRefresh } = useApp();

  const [balancesData, setBalancesData] = useState<BalancesResponse | null>(null);
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Deletion confirm modal state
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!currentFlat || !currentUser) return;

    setIsLoading(true);
    setError(null);

    Promise.all([
      api.getBalances(currentFlat.id, currentUser.id),
      api.getExpenses(currentFlat.id, currentUser.id, 1, 5),
    ])
      .then(([bRes, eRes]) => {
        setBalancesData(bRes.data);
        setRecentExpenses(eRes.data);
      })
      .catch((err) => {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Failed to load dashboard data.');
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [currentFlat, currentUser, refreshKey]);

  // Find user's balance in the balances array
  const myBalance = balancesData?.balances.find((b) => b.userId === currentUser?.id);
  const netPaise = myBalance?.netBalancePaise || 0;
  const youAreOwedPaise = netPaise > 0 ? netPaise : 0;
  const youOwePaise = netPaise < 0 ? -netPaise : 0;

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !currentFlat || !currentUser) return;
    setIsDeleting(true);
    try {
      await api.deleteExpense(currentFlat.id, deleteTarget.id, currentUser.id);
      setDeleteTarget(null);
      triggerRefresh();
    } catch (err) {
      console.error('Failed to delete expense:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50/50">
      <Header
        title="Dashboard"
        subtitle={`Welcome back, ${currentUser?.name || 'Member'}`}
      />

      <main className="p-8 max-w-7xl w-full mx-auto space-y-8">
        {/* Error state */}
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center space-x-3 text-rose-700 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">Unable to load flat details</p>
              <p className="text-xs text-rose-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <LoadingSpinner message="Calculating real-time ledger & balances..." />
        ) : error ? null : (
          <>
            {/* Top Summary Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Total Spending */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition">
                <div className="flex items-center justify-between text-slate-500 mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Flat Spending
                  </span>
                  <div className="p-2 bg-slate-100 rounded-xl text-slate-600">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {formatPaise(balancesData?.totalSpendingPaise || 0)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Total non-deleted expenses</p>
              </div>

              {/* You are owed */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-emerald-200 transition">
                <div className="flex items-center justify-between text-slate-500 mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    You Are Owed
                  </span>
                  <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                    <ArrowDownLeft className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-emerald-600">
                  {formatPaise(youAreOwedPaise)}
                </div>
                <p className="text-xs text-slate-500 mt-1">From fellow flatmates</p>
              </div>

              {/* You owe */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-rose-200 transition">
                <div className="flex items-center justify-between text-slate-500 mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    You Owe
                  </span>
                  <div className="p-2 bg-rose-50 rounded-xl text-rose-600">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-rose-600">
                  {formatPaise(youOwePaise)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Your outstanding dues</p>
              </div>

              {/* Net Balance */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-indigo-200 transition">
                <div className="flex items-center justify-between text-slate-500 mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Your Net Balance
                  </span>
                  <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                    <Scale className="w-4 h-4" />
                  </div>
                </div>
                <div
                  className={`text-2xl font-bold ${
                    netPaise > 0
                      ? 'text-emerald-600'
                      : netPaise < 0
                      ? 'text-rose-600'
                      : 'text-slate-700'
                  }`}
                >
                  {formatPaise(netPaise)}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {netPaise > 0
                    ? 'In the green'
                    : netPaise < 0
                    ? 'You have unsettled debts'
                    : 'All settled up!'}
                </p>
              </div>
            </div>

            {/* Quick Settlements Section */}
            {balancesData?.settlements && balancesData.settlements.length > 0 && (
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-indigo-950 flex items-center space-x-2">
                    <Scale className="w-4 h-4 text-indigo-600" />
                    <span>Deterministic Settlement Suggestions</span>
                  </h3>
                  <Link
                    to="/balances"
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1"
                  >
                    <span>View full breakdown</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {balancesData.settlements.slice(0, 3).map((s, idx) => (
                    <div
                      key={idx}
                      className="bg-white px-4 py-3 rounded-xl border border-indigo-100 shadow-xs flex items-center justify-between"
                    >
                      <div className="truncate mr-2">
                        <span className="text-xs font-bold text-slate-900">{s.fromUserName}</span>
                        <span className="text-xs text-slate-500 mx-1.5">owes</span>
                        <span className="text-xs font-bold text-indigo-600">{s.toUserName}</span>
                      </div>
                      <span className="text-sm font-bold text-slate-900 font-mono shrink-0">
                        {formatPaise(s.amountPaise)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Expenses List */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Recent Flat Expenses</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Latest shared transactions recorded in this flat
                  </p>
                </div>
                <Link
                  to="/expenses"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1"
                >
                  <span>View all expenses</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {recentExpenses.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="No expenses recorded yet"
                  description="Start tracking shared groceries, bills, and rent by recording your first expense."
                  actionLabel="Record Expense"
                  onAction={openAddExpense}
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentExpenses.map((expense) => (
                    <div
                      key={expense.id}
                      className="p-5 hover:bg-slate-50/60 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center space-x-2.5">
                          <h4 className="text-sm font-bold text-slate-900">
                            {expense.description}
                          </h4>
                          {expense.isCreator && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
                              You recorded
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span>
                            Paid by <strong className="text-slate-800">{expense.paidBy.name}</strong>
                          </span>
                          <span>•</span>
                          <span className="flex items-center space-x-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {new Date(expense.createdAt).toLocaleDateString('en-IN', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </span>
                          </span>
                          <span>•</span>
                          <span>
                            Split between{' '}
                            <strong className="text-slate-700">
                              {expense.shares.length} {expense.shares.length === 1 ? 'member' : 'members'}
                            </strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4 self-end sm:self-center">
                        <div className="text-right">
                          <span className="text-base font-bold text-slate-900 font-mono">
                            {formatPaise(expense.amountPaise)}
                          </span>
                        </div>

                        {expense.isCreator && (
                          <div className="flex items-center space-x-1 pl-2 border-l border-slate-200">
                            <button
                              onClick={() => openEditExpense(expense)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                              title="Edit Expense"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(expense)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Delete Expense"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete Expense"
        message={`Are you sure you want to delete "${deleteTarget?.description}"? This will soft-delete the transaction and immediately remove it from all balance calculations.`}
        confirmLabel="Delete Expense"
        isDestructive={true}
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
