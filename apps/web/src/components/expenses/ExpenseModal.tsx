import React, { useEffect, useState, useMemo } from 'react';
import { X, Check, Calculator, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { api, ApiClientError } from '../../services/api.js';
import { FlatMember } from '../../types/index.js';
import { formatPaise, parseRupeesToPaise, paiseToRupeeInput } from '../../utils/currency.js';

export const ExpenseModal: React.FC = () => {
  const {
    isExpenseModalOpen,
    editingExpense,
    closeExpenseModal,
    currentFlat,
    currentUser,
    triggerRefresh,
  } = useApp();

  const [members, setMembers] = useState<FlatMember[]>([]);
  const [description, setDescription] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [paidByUserId, setPaidByUserId] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load flat members
  useEffect(() => {
    if (!currentFlat || !currentUser || !isExpenseModalOpen) return;

    api.getMembers(currentFlat.id, currentUser.id)
      .then((res) => {
        // Only active members can be selected for new expenses
        const activeMembers = res.data.filter((m) => !m.hasLeft);
        setMembers(activeMembers);

        if (editingExpense) {
          setDescription(editingExpense.description);
          setAmountInput(paiseToRupeeInput(editingExpense.amountPaise));
          setPaidByUserId(editingExpense.paidBy.id);
          setSelectedUserIds(editingExpense.shares.map((s) => s.userId));
        } else {
          setDescription('');
          setAmountInput('');
          setPaidByUserId(currentUser.id);
          setSelectedUserIds(activeMembers.map((m) => m.id));
        }
      })
      .catch((err) => {
        console.error('Failed to load flat members for expense form:', err);
      });

    setErrors({});
    setServerError(null);
  }, [currentFlat, currentUser, isExpenseModalOpen, editingExpense]);

  // Live split calculation
  const totalPaise = useMemo(() => parseRupeesToPaise(amountInput), [amountInput]);

  const liveSplitPreview = useMemo(() => {
    if (totalPaise <= 0 || selectedUserIds.length === 0) return null;

    const count = selectedUserIds.length;
    const sortedIds = [...selectedUserIds].sort();
    const baseShare = Math.floor(totalPaise / count);
    const remainder = totalPaise % count;

    const previewList = sortedIds.map((userId, idx) => {
      const share = idx < remainder ? baseShare + 1 : baseShare;
      const member = members.find((m) => m.id === userId);
      return {
        userId,
        name: member?.name || 'Member',
        amountPaise: share,
      };
    });

    const isAllEqual = remainder === 0;

    return {
      count,
      baseShare,
      remainder,
      isAllEqual,
      shares: previewList,
    };
  }, [totalPaise, selectedUserIds, members]);

  const toggleSelectUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    setSelectedUserIds(members.map((m) => m.id));
  };

  const handleDeselectAll = () => {
    setSelectedUserIds([]);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!description.trim()) {
      newErrors.description = 'Please enter an expense description.';
    } else if (description.trim().length > 255) {
      newErrors.description = 'Description cannot exceed 255 characters.';
    }

    if (!amountInput.trim()) {
      newErrors.amount = 'Please enter an expense amount.';
    } else {
      const paise = parseRupeesToPaise(amountInput);
      if (paise <= 0) {
        newErrors.amount = 'Amount must be greater than zero.';
      }
    }

    if (!paidByUserId) {
      newErrors.paidBy = 'Please select who paid for this expense.';
    }

    if (selectedUserIds.length === 0) {
      newErrors.participants = 'Please select at least one person to split the bill with.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate() || !currentFlat || !currentUser || isSubmitting) return;

    setIsSubmitting(true);
    const amountPaise = parseRupeesToPaise(amountInput);

    try {
      if (editingExpense) {
        await api.updateExpense(currentFlat.id, editingExpense.id, currentUser.id, {
          description: description.trim(),
          amountPaise,
          paidByUserId,
          splitBetweenUserIds: selectedUserIds,
        });
      } else {
        await api.createExpense(currentFlat.id, currentUser.id, {
          description: description.trim(),
          amountPaise,
          paidByUserId,
          splitBetweenUserIds: selectedUserIds,
        });
      }

      triggerRefresh();
      closeExpenseModal();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.message);
        if (err.details && Object.keys(err.details).length > 0) {
          setErrors(err.details);
        }
      } else {
        setServerError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isExpenseModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {editingExpense ? 'Edit Shared Expense' : 'Record New Expense'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              In {currentFlat?.name || 'Selected Flat'}
            </p>
          </div>
          <button
            onClick={closeExpenseModal}
            className="text-slate-400 hover:text-slate-600 transition p-1 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Server Error Alert */}
        {serverError && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-2 text-rose-700 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Description <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Monthly Wi-Fi Bill, Blinkit Groceries"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 transition ${
                errors.description
                  ? 'border-rose-300 focus:ring-rose-400 bg-rose-50/30'
                  : 'border-slate-200 focus:ring-indigo-500 focus:bg-white'
              }`}
            />
            {errors.description && (
              <p className="mt-1 text-xs text-rose-600">{errors.description}</p>
            )}
          </div>

          {/* Amount and Payer Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Amount */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Amount (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-slate-400 text-sm font-medium">₹</span>
                <input
                  type="text"
                  placeholder="0.00"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  disabled={isSubmitting}
                  className={`w-full pl-8 pr-3.5 py-2.5 bg-slate-50 border rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 transition ${
                    errors.amount
                      ? 'border-rose-300 focus:ring-rose-400 bg-rose-50/30'
                      : 'border-slate-200 focus:ring-indigo-500 focus:bg-white'
                  }`}
                />
              </div>
              {errors.amount && (
                <p className="mt-1 text-xs text-rose-600">{errors.amount}</p>
              )}
            </div>

            {/* Paid By */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Paid By <span className="text-rose-500">*</span>
              </label>
              <select
                value={paidByUserId}
                onChange={(e) => setPaidByUserId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.id === currentUser?.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
              {errors.paidBy && (
                <p className="mt-1 text-xs text-rose-600">{errors.paidBy}</p>
              )}
            </div>
          </div>

          {/* Split Between */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Split Between ({selectedUserIds.length}/{members.length}) <span className="text-rose-500">*</span>
              </label>
              <div className="flex space-x-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
                >
                  Select All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="text-slate-500 hover:text-slate-700 font-medium hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto p-1">
              {members.map((member) => {
                const isSelected = selectedUserIds.includes(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => toggleSelectUser(member.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl border text-left transition ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/60 text-indigo-900 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <div className="truncate">
                      <p className="text-xs font-semibold truncate">
                        {member.name} {member.id === currentUser?.id ? '(You)' : ''}
                      </p>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-md flex items-center justify-center border transition ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>
            {errors.participants && (
              <p className="mt-1 text-xs text-rose-600">{errors.participants}</p>
            )}
          </div>

          {/* Live Split Preview Box */}
          {liveSplitPreview && (
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2">
              <div className="flex items-center justify-between font-semibold text-slate-800 border-b border-slate-200 pb-1.5">
                <span className="flex items-center space-x-1.5">
                  <Calculator className="w-4 h-4 text-indigo-600" />
                  <span>Equal Split Breakdown</span>
                </span>
                <span className="text-indigo-600 font-mono">
                  {formatPaise(totalPaise)} Total
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 text-slate-600 font-mono text-[11px]">
                {liveSplitPreview.shares.map((share) => (
                  <div key={share.userId} className="flex justify-between items-center">
                    <span className="truncate pr-2">{share.name}:</span>
                    <span className="font-semibold text-slate-900">{formatPaise(share.amountPaise)}</span>
                  </div>
                ))}
              </div>

              {!liveSplitPreview.isAllEqual && (
                <p className="text-[10px] text-slate-500 italic pt-1">
                  * 1 paise remainder distributed deterministically according to lexicographical user ID order.
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-100">
            <button
              type="button"
              onClick={closeExpenseModal}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow-md shadow-indigo-200 flex items-center space-x-2 disabled:opacity-50"
            >
              {isSubmitting && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              <span>{editingExpense ? 'Save Changes' : 'Record Expense'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
