import React, { useEffect, useState } from 'react';
import {
  Receipt,
  Calendar,
  User,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  AlertCircle,
  Plus,
  Users,
} from 'lucide-react';
import { Header } from '../components/layout/Header.js';
import { useApp } from '../context/AppContext.js';
import { api, ApiClientError } from '../services/api.js';
import { Expense, Pagination } from '../types/index.js';
import { formatPaise } from '../utils/currency.js';
import { LoadingSpinner } from '../components/common/LoadingSpinner.js';
import { EmptyState } from '../components/common/EmptyState.js';
import { ConfirmDialog } from '../components/common/ConfirmDialog.js';

export const ExpensesPage: React.FC = () => {
  const { currentFlat, currentUser, refreshKey, openAddExpense, openEditExpense, triggerRefresh } = useApp();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    totalCount: 0,
    totalPages: 1,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Deletion state
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!currentFlat || !currentUser) return;

    setIsLoading(true);
    setError(null);

    api.getExpenses(currentFlat.id, currentUser.id, pagination.page, pagination.limit)
      .then((res) => {
        setExpenses(res.data);
        setPagination(res.pagination);
      })
      .catch((err) => {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Failed to load expenses list.');
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [currentFlat, currentUser, pagination.page, refreshKey]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPagination((p) => ({ ...p, page: newPage }));
    }
  };

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
        title="Expenses"
        subtitle={`All ledger expenses for ${currentFlat?.name || 'this flat'}`}
      />

      <main className="p-8 max-w-7xl w-full mx-auto space-y-6">
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center space-x-3 text-rose-700 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">Unable to load expenses</p>
              <p className="text-xs text-rose-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <LoadingSpinner message="Fetching expenses ledger..." />
        ) : error ? null : expenses.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No expenses found"
            description="There are currently no active expenses recorded in this flat."
            actionLabel="Add Expense"
            onAction={openAddExpense}
          />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {/* Header info */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/40">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Showing {expenses.length} of {pagination.totalCount} {pagination.totalCount === 1 ? 'expense' : 'expenses'}
              </span>
              <button
                onClick={openAddExpense}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record New</span>
              </button>
            </div>

            {/* List */}
            <div className="divide-y divide-slate-100">
              {expenses.map((expense) => (
                <div
                  key={expense.id}
                  className="p-6 hover:bg-slate-50/60 transition flex flex-col lg:flex-row lg:items-center justify-between gap-6"
                >
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-base font-bold text-slate-900">
                        {expense.description}
                      </h3>
                      {expense.isCreator && (
                        <span className="text-[11px] bg-indigo-50 text-indigo-700 font-semibold px-2.5 py-0.5 rounded-full border border-indigo-100">
                          Recorded by you
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
                      <span className="flex items-center space-x-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          Paid by <strong className="text-slate-800">{expense.paidBy.name}</strong>
                        </span>
                      </span>

                      <span>•</span>

                      <span className="flex items-center space-x-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>
                          {new Date(expense.createdAt).toLocaleDateString('en-IN', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </span>

                      <span>•</span>

                      <span className="text-slate-500">
                        Recorded by <span className="text-slate-700">{expense.createdBy.name}</span>
                      </span>
                    </div>

                    {/* Split Participants Chips */}
                    <div className="flex items-center space-x-2 pt-1">
                      <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div className="flex flex-wrap gap-1.5">
                        {expense.shares.map((share) => (
                          <span
                            key={share.userId}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700"
                          >
                            <span>{share.userName}</span>
                            <span className="text-slate-400 font-mono text-[10px]">
                              ({formatPaise(share.amountPaise)})
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Amount and Actions */}
                  <div className="flex items-center justify-between lg:justify-end space-x-5 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    <div className="text-left lg:text-right">
                      <span className="text-xl font-bold text-slate-900 font-mono">
                        {formatPaise(expense.amountPaise)}
                      </span>
                      <p className="text-[11px] text-slate-400">
                        {expense.shares.length}-way equal split
                      </p>
                    </div>

                    {expense.isCreator && (
                      <div className="flex items-center space-x-1.5 pl-3 border-l border-slate-200">
                        <button
                          onClick={() => openEditExpense(expense)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition"
                          title="Edit Expense"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(expense)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
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

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

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
