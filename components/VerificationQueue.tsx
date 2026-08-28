import React, { useState, useEffect } from 'react';
import { User, VerificationStatus } from '../types';
import { toast } from 'sonner';

interface VerificationQueueProps {
  users: User[];
  onUpdateUser: (u: User) => void;
}

export const VerificationQueue: React.FC<VerificationQueueProps> = ({ users, onUpdateUser }) => {
  const pending = users.filter(u => u.passportPhoto?.status === VerificationStatus.PENDING || u.idProof?.status === VerificationStatus.PENDING);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Track individual statuses and reasons in local state for the modal
  const [reviewState, setReviewState] = useState({
    passportStatus: VerificationStatus.PENDING,
    passportReason: '',
    idStatus: VerificationStatus.PENDING,
    idReason: ''
  });

  useEffect(() => {
    if (selectedUser) {
      setReviewState({
        passportStatus: selectedUser.passportPhoto?.status || VerificationStatus.PENDING,
        passportReason: selectedUser.passportPhoto?.rejectionReason || '',
        idStatus: selectedUser.idProof?.status || VerificationStatus.PENDING,
        idReason: selectedUser.idProof?.rejectionReason || ''
      });
    }
  }, [selectedUser]);

  const handleSaveAll = () => {
    if (!selectedUser) return;
    const updated = { ...selectedUser };

    if (updated.passportPhoto) {
      updated.passportPhoto = {
        ...updated.passportPhoto,
        status: reviewState.passportStatus,
        rejectionReason: reviewState.passportStatus === VerificationStatus.REJECTED ? reviewState.passportReason : ''
      };
    }

    if (updated.idProof) {
      updated.idProof = {
        ...updated.idProof,
        status: reviewState.idStatus,
        rejectionReason: reviewState.idStatus === VerificationStatus.REJECTED ? reviewState.idReason : ''
      };
    }

    onUpdateUser(updated);
    setSelectedUser(null);
    toast.success("Verification updates saved for " + selectedUser.name);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 transition-all duration-300">
      <h2 className="text-3xl font-bold text-slate-900 dark:text-white transition-all">Verification Queue</h2>
      {pending.length === 0 ? (
        <div className="py-24 text-center text-slate-400 font-medium bg-white dark:bg-slate-900 rounded-lg border dark:border-slate-800 shadow-sm transition-colors duration-300 italic">All caught up! No pending verifications.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 transition-all duration-300">
          {pending.map(u => (
            <div key={u.id} onClick={() => setSelectedUser(u)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-lg flex items-center gap-4 hover:shadow-lg hover:border-indigo-100 dark:hover:border-indigo-900/30 transition-all duration-300 cursor-pointer group">
              <div className="w-14 h-14 bg-indigo-50 dark:bg-slate-800 rounded-lg flex items-center justify-center font-bold text-indigo-600 text-xl shadow-inner transition-colors duration-300 overflow-hidden">
                {u.avatar ? (
                  <img src={u.avatar} className="w-full h-full object-cover rounded-lg transition-all duration-300" />
                ) : u.passportPhoto?.fileUrl ? (
                  <img src={u.passportPhoto.fileUrl} className="w-full h-full object-cover rounded-lg transition-all duration-300" />
                ) : (
                  u.name.charAt(0)
                )}
              </div>
              <div className="flex-1 transition-colors duration-300">
                <h4 className="font-bold text-slate-800 dark:text-white transition-colors duration-300">{u.name}</h4>
                <p className="text-xs text-slate-500 font-medium transition-colors duration-300">Pending Docs: {[u.passportPhoto?.status === VerificationStatus.PENDING && 'Passport', u.idProof?.status === VerificationStatus.PENDING && 'ID Proof'].filter(Boolean).join(', ')}</p>
              </div>
              <button className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg text-xs font-bold active:scale-95 transition-all duration-300 shadow-lg shadow-indigo-600/10">Review Submission</button>
            </div>
          ))}
        </div>
      )}

      {selectedUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 transition-all duration-500 animate-in fade-in">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setSelectedUser(null)}></div>
          <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 border border-slate-200 dark:border-slate-800">
            <header className="px-10 py-8 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
              <div>
                <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Review Submissions</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">{selectedUser.name}</span>
                  <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                  <span className="text-xs font-medium text-slate-500">{selectedUser.email}</span>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="p-3 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all text-slate-400 border border-transparent hover:border-slate-100 dark:hover:border-slate-700"><i className="fa-solid fa-xmark text-xl"></i></button>
            </header>

            <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-10 max-h-[65vh] overflow-y-auto custom-scrollbar">
              {/* Passport Section */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">1. Passport Photo</h4>
                </div>
                <div className="h-48 aspect-video mx-auto bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden border-2 border-slate-50 dark:border-slate-700 shadow-inner group relative">
                  {selectedUser.passportPhoto?.fileUrl ? (
                    <>
                      <img src={selectedUser.passportPhoto.fileUrl} className="w-full h-full object-cover transition-all" />
                      <a href={selectedUser.passportPhoto.fileUrl} target="_blank" rel="noreferrer" className="absolute top-4 right-4 bg-white/90 dark:bg-slate-900/90 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-indigo-600 shadow-md"><i className="fa-solid fa-expand"></i></a>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3"><i className="fa-solid fa-camera text-4xl"></i><span className="text-xs font-bold uppercase">Not Provided</span></div>
                  )}
                </div>

                {selectedUser.passportPhoto?.fileUrl && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setReviewState({ ...reviewState, passportStatus: VerificationStatus.APPROVED })}
                        className={`py-3 rounded-lg font-bold text-xs transition-all ${reviewState.passportStatus === VerificationStatus.APPROVED ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-600'}`}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setReviewState({ ...reviewState, passportStatus: VerificationStatus.REJECTED })}
                        className={`py-3 rounded-lg font-bold text-xs transition-all ${reviewState.passportStatus === VerificationStatus.REJECTED ? 'bg-rose-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-500/10 hover:text-rose-600'}`}
                      >
                        Reject
                      </button>
                    </div>
                    {reviewState.passportStatus === VerificationStatus.REJECTED && (
                      <textarea
                        className="w-full p-4 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 rounded-lg text-xs font-medium focus:ring-1 focus:ring-rose-500 outline-none transition-all"
                        placeholder="Rejection reason (visible to user)..."
                        rows={3}
                        value={reviewState.passportReason}
                        onChange={(e) => setReviewState({ ...reviewState, passportReason: e.target.value })}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* ID Proof Section */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">2. Government ID ({selectedUser.idProof?.type || 'Not Set'})</h4>
                </div>
                <div className="h-48 aspect-video mx-auto bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden border-2 border-slate-50 dark:border-slate-700 shadow-inner group relative">
                  {selectedUser.idProof?.fileUrl ? (
                    <>
                      <img src={selectedUser.idProof.fileUrl} className="w-full h-full object-cover transition-all" />
                      <a href={selectedUser.idProof.fileUrl} target="_blank" rel="noreferrer" className="absolute top-4 right-4 bg-white/90 dark:bg-slate-900/90 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all text-violet-600 shadow-md"><i className="fa-solid fa-expand"></i></a>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3"><i className="fa-solid fa-id-card text-4xl"></i><span className="text-xs font-bold uppercase">Not Provided</span></div>
                  )}
                </div>

                {selectedUser.idProof?.fileUrl && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setReviewState({ ...reviewState, idStatus: VerificationStatus.APPROVED })}
                        className={`py-3 rounded-lg font-bold text-xs transition-all ${reviewState.idStatus === VerificationStatus.APPROVED ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-emerald-500/10 hover:text-emerald-600'}`}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setReviewState({ ...reviewState, idStatus: VerificationStatus.REJECTED })}
                        className={`py-3 rounded-lg font-bold text-xs transition-all ${reviewState.idStatus === VerificationStatus.REJECTED ? 'bg-rose-600 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-rose-500/10 hover:text-rose-600'}`}
                      >
                        Reject
                      </button>
                    </div>
                    {reviewState.idStatus === VerificationStatus.REJECTED && (
                      <textarea
                        className="w-full p-4 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 rounded-lg text-xs font-medium focus:ring-1 focus:ring-rose-500 outline-none transition-all"
                        placeholder="Rejection reason (visible to user)..."
                        rows={3}
                        value={reviewState.idReason}
                        onChange={(e) => setReviewState({ ...reviewState, idReason: e.target.value })}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="p-10 border-t dark:border-slate-800 flex gap-4 bg-slate-50/30 dark:bg-slate-800/20">
              <button onClick={() => setSelectedUser(null)} className="flex-1 py-4 text-slate-500 font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-transparent hover:border-slate-200 dark:border-slate-700 text-sm">Cancel Review</button>
              <button
                onClick={handleSaveAll}
                className="flex-[2] py-4 bg-indigo-600 text-white font-bold rounded-lg shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 transition-all text-sm uppercase tracking-widest"
              >
                Save Decisions & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VerificationQueue;
