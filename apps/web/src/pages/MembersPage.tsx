import React, { useEffect, useState } from 'react';
import {
  UserCheck,
  UserMinus,
  Calendar,
  LogOut,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { Header } from '../components/layout/Header.js';
import { useApp } from '../context/AppContext.js';
import { api, ApiClientError } from '../services/api.js';
import { FlatMember } from '../types/index.js';
import { LoadingSpinner } from '../components/common/LoadingSpinner.js';
import { ConfirmDialog } from '../components/common/ConfirmDialog.js';

export const MembersPage: React.FC = () => {
  const { currentFlat, currentUser, refreshKey, triggerRefresh } = useApp();

  const [members, setMembers] = useState<FlatMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Leave flat modal
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentFlat || !currentUser) return;

    setIsLoading(true);
    setError(null);

    api.getMembers(currentFlat.id, currentUser.id)
      .then((res) => {
        setMembers(res.data);
      })
      .catch((err) => {
        if (err instanceof ApiClientError) {
          setError(err.message);
        } else {
          setError('Failed to load flat members.');
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [currentFlat, currentUser, refreshKey]);

  const activeMembers = members.filter((m) => !m.hasLeft);
  const departedMembers = members.filter((m) => m.hasLeft);

  const currentUserMembership = members.find((m) => m.id === currentUser?.id);
  const canLeave = currentUserMembership && !currentUserMembership.hasLeft;

  const handleLeaveConfirm = async () => {
    if (!currentFlat || !currentUser) return;
    setIsLeaving(true);
    setLeaveError(null);

    try {
      await api.leaveFlat(currentFlat.id, currentUser.id);
      setIsLeaveModalOpen(false);
      triggerRefresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setLeaveError(err.message);
      } else {
        setLeaveError('Failed to leave the flat.');
      }
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-slate-50/50">
      <Header
        title="Flat Members"
        subtitle={`Active and historical members of ${currentFlat?.name || 'this flat'}`}
      />

      <main className="p-8 max-w-7xl w-full mx-auto space-y-8">
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center space-x-3 text-rose-700 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">Unable to load members</p>
              <p className="text-xs text-rose-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {leaveError && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center space-x-3 text-rose-700 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">Error leaving flat</p>
              <p className="text-xs text-rose-600 mt-0.5">{leaveError}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <LoadingSpinner message="Loading membership roster..." />
        ) : error ? null : (
          <>
            {/* Active Members Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                    <UserCheck className="w-5 h-5 text-indigo-600" />
                    <span>Active Flatmates ({activeMembers.length})</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Members who can record expenses and participate in splits
                  </p>
                </div>

                {canLeave && (
                  <button
                    onClick={() => setIsLeaveModalOpen(true)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition flex items-center space-x-1.5 shadow-xs"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Leave Flat</span>
                  </button>
                )}
              </div>

              <div className="divide-y divide-slate-100">
                {activeMembers.map((member) => {
                  const isCurrent = member.id === currentUser?.id;
                  return (
                    <div
                      key={member.id}
                      className={`p-5 flex items-center justify-between transition ${
                        isCurrent ? 'bg-indigo-50/20' : 'hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center space-x-4">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                            isCurrent
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {member.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-bold text-slate-900">
                              {member.name}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                                YOU
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400">{member.email}</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 text-xs text-slate-500">
                        <div className="flex items-center space-x-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            Joined {new Date(member.joinedAt).toLocaleDateString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                          Active
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Departed Members Card */}
            {departedMembers.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                  <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                    <UserMinus className="w-5 h-5 text-slate-400" />
                    <span>Departed Members ({departedMembers.length})</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Historical members who left the flat. Their historical balances remain preserved.
                  </p>
                </div>

                <div className="divide-y divide-slate-100">
                  {departedMembers.map((member) => (
                    <div
                      key={member.id}
                      className="p-5 flex items-center justify-between bg-slate-50/30"
                    >
                      <div className="flex items-center space-x-4 opacity-70">
                        <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center font-bold text-sm text-slate-500">
                          {member.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-slate-800">
                            {member.name}
                          </span>
                          <p className="text-xs text-slate-400">{member.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 text-xs text-slate-500">
                        <div className="flex items-center space-x-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            Left on{' '}
                            {member.leftAt
                              ? new Date(member.leftAt).toLocaleDateString('en-IN', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : 'Unknown'}
                          </span>
                        </div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                          Departed
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Leave Flat Confirmation Modal */}
      <ConfirmDialog
        isOpen={isLeaveModalOpen}
        title="Leave This Flat?"
        message="Are you sure you want to leave this flat? Once you leave, your access to this flat's expenses and balances will be immediately revoked. Your historical expenses and financial balances will remain recorded for fair accounting."
        confirmLabel="Leave Flat"
        cancelLabel="Stay in Flat"
        isDestructive={true}
        isLoading={isLeaving}
        onConfirm={handleLeaveConfirm}
        onCancel={() => setIsLeaveModalOpen(false)}
      />
    </div>
  );
};
