import React, { useEffect, useState } from 'react';
import {
  Scale,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { Header } from '../components/layout/Header.js';
import { useApp } from '../context/AppContext.js';
import { api, ApiClientError } from '../services/api.js';
import { BalancesResponse } from '../types/index.js';
import { formatPaise } from '../utils/currency.js';
import { LoadingSpinner } from '../components/common/LoadingSpinner.js';
import { EmptyState } from '../components/common/EmptyState.js';

export const BalancesPage: React.FC = () => {
  const { currentFlat, currentUser, refreshKey } = useApp();

  const [balancesData, setBalancesData] = useState<BalancesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentFlat || !currentUser) return;

    setIsLoading(true);
    setError(null);

    api.getBalances(currentFlat.id, currentUser.id)
      .then((res) => {
        setBalancesData(res.data);
      })
      .catch((err) => {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Failed to load flat balances.');
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [currentFlat, currentUser, refreshKey]);

  // Compute total net sum across all members to demonstrate the zero-sum invariant
  const totalNetSumPaise = balancesData?.balances.reduce(
    (acc, b) => acc + b.netBalancePaise,
    0
  ) || 0;

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50/50">
      <Header
        title="Balances & Settlements"
        subtitle={`Computed real-time using aggregated SQL JOINs for ${currentFlat?.name || 'this flat'}`}
      />

      <main className="p-8 max-w-7xl w-full mx-auto space-y-8">
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center space-x-3 text-rose-700 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">Unable to load balances</p>
              <p className="text-xs text-rose-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <LoadingSpinner message="Executing aggregated balance CTE query..." />
        ) : error ? null : !balancesData ? (
          <EmptyState
            icon={Scale}
            title="No balance data available"
            description="Balance calculations require active flat membership."
          />
        ) : (
          <>
            {/* Top Stat Banner: Invariant Proof */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Zero-Sum Financial Invariant
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Net balance across all members strictly sums to{' '}
                    <span className="font-mono font-semibold text-slate-800">
                      {formatPaise(totalNetSumPaise)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                    Total Flat Spending
                  </span>
                  <p className="text-lg font-bold text-slate-900 font-mono">
                    {formatPaise(balancesData.totalSpendingPaise)}
                  </p>
                </div>
              </div>
            </div>

            {/* Balances Roster Table */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Member Balance Summary</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Balance = Total Amount Paid − Total Share Amount
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-3.5 px-6">Member</th>
                      <th className="py-3.5 px-6 text-right">Total Paid</th>
                      <th className="py-3.5 px-6 text-right">Total Share</th>
                      <th className="py-3.5 px-6 text-right">Net Balance</th>
                      <th className="py-3.5 px-6 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {balancesData.balances.map((member) => {
                      const isCurrentUser = member.userId === currentUser?.id;
                      const isPositive = member.netBalancePaise > 0;
                      const isNegative = member.netBalancePaise < 0;
                      const isZero = member.netBalancePaise === 0;

                      return (
                        <tr
                          key={member.userId}
                          className={`hover:bg-slate-50/50 transition ${
                            isCurrentUser ? 'bg-indigo-50/30' : ''
                          }`}
                        >
                          {/* Member info */}
                          <td className="py-4 px-6">
                            <div className="flex items-center space-x-3">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                                  isCurrentUser
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {member.userName.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center space-x-1.5">
                                  <span className="font-semibold text-slate-900">
                                    {member.userName}
                                  </span>
                                  {isCurrentUser && (
                                    <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-1.5 py-0.2 rounded">
                                      YOU
                                    </span>
                                  )}
                                  {member.hasLeft && (
                                    <span className="text-[10px] bg-slate-100 text-slate-500 font-medium px-1.5 py-0.2 rounded border border-slate-200">
                                      Departed
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-slate-400">{member.userEmail}</span>
                              </div>
                            </div>
                          </td>

                          {/* Total Paid */}
                          <td className="py-4 px-6 text-right font-mono font-medium text-slate-900">
                            {formatPaise(member.totalPaidPaise)}
                          </td>

                          {/* Total Share */}
                          <td className="py-4 px-6 text-right font-mono font-medium text-slate-600">
                            {formatPaise(member.totalSharePaise)}
                          </td>

                          {/* Net Balance */}
                          <td
                            className={`py-4 px-6 text-right font-mono font-bold text-base ${
                              isPositive
                                ? 'text-emerald-600'
                                : isNegative
                                ? 'text-rose-600'
                                : 'text-slate-600'
                            }`}
                          >
                            {formatPaise(member.netBalancePaise)}
                          </td>

                          {/* Status Badge */}
                          <td className="py-4 px-6 text-center">
                            {isPositive && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                Owed {formatPaise(member.netBalancePaise)}
                              </span>
                            )}
                            {isNegative && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-100">
                                Owes {formatPaise(-member.netBalancePaise)}
                              </span>
                            )}
                            {isZero && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                                Settled
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Plain-Language Settlement Suggestions */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                    <Scale className="w-5 h-5 text-indigo-600" />
                    <span>Suggested Settlements</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                    Deterministic greedy matching minimizing the total number of cash transfers required
                    to balance all flatmate accounts without altering the underlying ledger.
                  </p>
                </div>
              </div>

              {balancesData.settlements.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mb-2" />
                  <p className="text-sm font-bold text-slate-800">Everyone is currently settled!</p>
                  <p className="text-xs text-slate-500 mt-0.5">No outstanding payments exist for this flat.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  {balancesData.settlements.map((settlement, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/40 hover:bg-white hover:border-indigo-200 transition flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold">
                          DEBT
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {settlement.formattedText}
                          </p>
                          <p className="text-xs text-slate-500">
                            Transfer {formatPaise(settlement.amountPaise)} directly to {settlement.toUserName}
                          </p>
                        </div>
                      </div>

                      <div className="text-right pl-4">
                        <span className="text-sm font-bold font-mono text-indigo-600">
                          {formatPaise(settlement.amountPaise)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};
