import React, { useState, useEffect } from 'react';
import { User, UserRole, PncQuestion, PncQuestionReply } from '../types';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import { PageBanner } from './PageBanner';
import Card from './Card';

interface AskPncViewProps {
  currentUser: User;
  isPncQueue?: boolean; // true if accessed from PnC 'PnC Inquiries', false if from Employee 'Ask a question'
}

export const AskPncView: React.FC<AskPncViewProps> = ({ currentUser, isPncQueue = false }) => {
  const isDeskStaff = currentUser.role === UserRole.PNC || currentUser.role === UserRole.PNC_ADMIN || currentUser.role === UserRole.ADMIN;
  const isPncAdmin = currentUser.role === UserRole.PNC_ADMIN || currentUser.role === UserRole.ADMIN;

  const [questions, setQuestions] = useState<PncQuestion[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<PncQuestion | null>(null);
  const [replies, setReplies] = useState<PncQuestionReply[]>([]);
  const [newQuestionTitle, setNewQuestionTitle] = useState('');
  const [newQuestionContent, setNewQuestionContent] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Promote to FAQ Modal
  const [promoteModalOpen, setPromoteModalOpen] = useState(false);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [faqCategory, setFaqCategory] = useState('General');
  const [isPromoting, setIsPromoting] = useState(false);

  const loadQuestions = async () => {
    try {
      let query = supabase
        .from('pnc_questions')
        .select('*')
        .order('created_at', { ascending: false });

      // If viewing as an employee asking questions, only show their own questions
      if (!isPncQueue && currentUser.role === UserRole.EMPLOYEE) {
        query = query.eq('employee_id', currentUser.id);
      }

      const { data, error } = await query;
      if (!error && data) {
        const mapped = data.map((d: any) => ({
          ...d,
          content: d.content || d.question || d.description || ''
        }));
        setQuestions(mapped as PncQuestion[]);
      }
    } catch (err: any) {
      console.error('Error loading questions:', err);
    }
  };

  const loadReplies = async (questionId: string) => {
    try {
      const { data, error } = await supabase
        .from('pnc_question_replies')
        .select('*')
        .eq('question_id', questionId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setReplies(data as PncQuestionReply[]);
      }
    } catch (err: any) {
      console.error('Error loading replies:', err);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, [currentUser.id, isPncQueue]);

  useEffect(() => {
    if (selectedQuestion) {
      loadReplies(selectedQuestion.id);
    }
  }, [selectedQuestion?.id]);

  const handleCreateQuestion = async () => {
    if (!newQuestionTitle.trim() || !newQuestionContent.trim()) {
      toast.error("Please fill in both a subject and question details.");
      return;
    }

    try {
      const { data: authData } = await supabase.auth.getUser();
      const authUserId = authData?.user?.id;
      const effectiveEmployeeId = authUserId || currentUser.id;
      const userName = currentUser.name || authData?.user?.user_metadata?.full_name || currentUser.email;
      const userEmail = currentUser.email || authData?.user?.email;

      const questionText = newQuestionContent.trim();

      // Primary payload populated with both content & question, and employee_* & asker_* columns
      const payload: any = {
        employee_id: effectiveEmployeeId,
        asker_id: effectiveEmployeeId,
        employee_name: userName,
        asker_name: userName,
        employee_email: userEmail,
        asker_email: userEmail,
        title: newQuestionTitle.trim(),
        content: questionText,
        question: questionText,
        status: 'Open'
      };

      let { data, error } = await supabase
        .from('pnc_questions')
        .insert(payload)
        .select()
        .single();

      // If schema does not recognise asker_* columns, retry without them
      if (error && (error.message?.includes('asker_') || error.code === 'PGRST204')) {
        const cleanPayload = { ...payload };
        delete cleanPayload.asker_id;
        delete cleanPayload.asker_name;
        delete cleanPayload.asker_email;
        const retry1 = await supabase.from('pnc_questions').insert(cleanPayload).select().single();
        if (!retry1.error) {
          data = retry1.data;
          error = null;
        } else {
          error = retry1.error;
        }
      }

      // If schema rejects content or question column
      if (error && (error.message?.includes("'content'") || error.message?.includes("'question'"))) {
        const altPayload = { ...payload };
        if (error.message?.includes("'content'")) delete altPayload.content;
        if (error.message?.includes("'question'")) delete altPayload.question;
        const retry2 = await supabase.from('pnc_questions').insert(altPayload).select().single();
        if (!retry2.error) {
          data = retry2.data;
          error = null;
        } else {
          error = retry2.error;
        }
      }

      if (error) throw error;

      toast.success("Question submitted to PnC Desk!");
      setNewQuestionTitle('');
      setNewQuestionContent('');
      setIsAsking(false);
      loadQuestions();
      if (data) {
        setSelectedQuestion({
          ...(data as any),
          content: (data as any).content || (data as any).question || ''
        });
      }
    } catch (err: any) {
      toast.error("Failed to submit question: " + err.message);
    }
  };

  const handleSendReply = async () => {
    if (!selectedQuestion || !replyText.trim()) return;
    setIsSubmittingReply(true);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const authUserId = authData?.user?.id;

      const authorRole = isDeskStaff
        ? (currentUser.role === UserRole.EMPLOYEE ? 'PNC' : (currentUser.role || 'PNC'))
        : 'Employee';

      const payload = {
        question_id: selectedQuestion.id,
        author_id: authUserId || currentUser.id,
        author_name: currentUser.name || authData?.user?.user_metadata?.full_name || currentUser.email,
        author_role: authorRole,
        reply_text: replyText.trim(),
        is_edited: false
      };

      const { data, error } = await supabase
        .from('pnc_question_replies')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      // If PnC replies to an Open question, mark it Answered
      if (isDeskStaff && selectedQuestion.status === 'Open') {
        let { error: statusErr } = await supabase
          .from('pnc_questions')
          .update({ status: 'Answered', updated_at: new Date().toISOString() })
          .eq('id', selectedQuestion.id);

        if (statusErr && statusErr.message?.includes('check_question_status')) {
          await supabase
            .from('pnc_questions')
            .update({ status: 'answered', updated_at: new Date().toISOString() })
            .eq('id', selectedQuestion.id);
        }

        setSelectedQuestion(prev => prev ? { ...prev, status: 'Answered' } : null);
      }

      // If Employee posts a follow-up to an Answered/Resolved question, mark it Open so PnC sees the new follow-up
      if (!isDeskStaff && (selectedQuestion.status === 'Answered' || selectedQuestion.status === 'Resolved')) {
        let { error: statusErr } = await supabase
          .from('pnc_questions')
          .update({ status: 'Open', updated_at: new Date().toISOString() })
          .eq('id', selectedQuestion.id);

        if (statusErr && statusErr.message?.includes('check_question_status')) {
          await supabase
            .from('pnc_questions')
            .update({ status: 'open', updated_at: new Date().toISOString() })
            .eq('id', selectedQuestion.id);
        }

        setSelectedQuestion(prev => prev ? { ...prev, status: 'Open' } : null);
      }

      setReplyText('');
      loadReplies(selectedQuestion.id);
      loadQuestions();
      toast.success(isDeskStaff ? "Response sent to employee" : "Follow-up question sent to PnC Desk");
    } catch (err: any) {
      toast.error("Failed to post reply: " + err.message);
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleUpdateStatus = async (newStatus: 'Open' | 'Answered' | 'Resolved') => {
    if (!selectedQuestion) return;
    try {
      let { error } = await supabase
        .from('pnc_questions')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', selectedQuestion.id);

      // If database constraint check_question_status rejects the string, try common aliases
      if (error && error.message?.includes('check_question_status')) {
        const fallbacks: Record<string, string[]> = {
          'Resolved': ['Closed', 'resolved', 'closed', 'Answered', 'answered'],
          'Open': ['open', 'Pending', 'pending'],
          'Answered': ['answered', 'Open', 'open']
        };

        const candidates = fallbacks[newStatus] || [];
        for (const candidate of candidates) {
          const retry = await supabase
            .from('pnc_questions')
            .update({ status: candidate, updated_at: new Date().toISOString() })
            .eq('id', selectedQuestion.id);
          if (!retry.error) {
            error = null;
            break;
          }
        }
      }

      if (error) throw error;

      setSelectedQuestion(prev => prev ? { ...prev, status: newStatus } : null);
      loadQuestions();
      toast.success(`Inquiry marked as ${newStatus}`);
    } catch (err: any) {
      toast.error("Failed to update status: " + err.message);
    }
  };

  const handleOpenPromoteModal = () => {
    if (!selectedQuestion) return;
    setFaqQuestion(selectedQuestion.title);
    // Find best answer from replies or fallback
    const latestPncReply = [...replies].reverse().find(r => r.author_role.includes('PNC') || r.author_role.includes('Admin'));
    setFaqAnswer(latestPncReply ? latestPncReply.reply_text : selectedQuestion.content);
    setPromoteModalOpen(true);
  };

  const handlePromoteToFaq = async () => {
    if (!selectedQuestion || !faqQuestion.trim() || !faqAnswer.trim()) {
      toast.error("Question and Answer cannot be empty");
      return;
    }

    setIsPromoting(true);
    try {
      const { data: faq, error: faqError } = await supabase
        .from('published_faqs')
        .insert({
          question: faqQuestion.trim(),
          answer: faqAnswer.trim(),
          category: faqCategory,
          promoted_from_question_id: selectedQuestion.id,
          promoted_by: currentUser.id,
          is_published: true
        })
        .select()
        .single();

      if (faqError) throw faqError;

      // Update question status to 'Promoted to FAQ'
      await supabase
        .from('pnc_questions')
        .update({
          status: 'Promoted to FAQ',
          promoted_faq_id: faq.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedQuestion.id);

      toast.success("Inquiry successfully published to Travel Guide FAQ!");
      setPromoteModalOpen(false);
      setSelectedQuestion(prev => prev ? { ...prev, status: 'Promoted to FAQ', promoted_faq_id: faq.id } : null);
      loadQuestions();
    } catch (err: any) {
      toast.error("Failed to promote to FAQ: " + err.message);
    } finally {
      setIsPromoting(false);
    }
  };

  const filteredQuestions = questions.filter(q => {
    if (statusFilter === 'ALL') return true;
    return q.status === statusFilter;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageBanner
        title={isPncQueue ? "PnC Inquiries Queue" : "Ask PnC"}
        description={
          isPncQueue
            ? "Manage, answer, and resolve employee questions about travel policies, bookings, and reimbursements."
            : "Have a question about travel rules, policies, or booking procedures? Ask the People & Culture team."
        }
        icon={isPncQueue ? "fa-headset" : "fa-circle-question"}
      >
        {!isPncQueue && (
          <button
            onClick={() => setIsAsking(!isAsking)}
            className="flex items-center gap-2 px-5 py-3 bg-white text-indigo-700 hover:bg-indigo-50 rounded-lg text-sm font-black shadow-lg transition-all"
          >
            <i className={`fa-solid ${isAsking ? 'fa-xmark' : 'fa-plus'}`}></i>
            {isAsking ? 'Cancel' : 'Ask a Question'}
          </button>
        )}
      </PageBanner>

      {/* Ask Question Form */}
      {isAsking && (
        <Card className="p-6 border-indigo-100 dark:border-indigo-900/40 shadow-md animate-in slide-in-from-top-3">
          <h3 className="text-base font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <i className="fa-solid fa-pen-to-square text-indigo-600"></i>
            Submit a Question to PnC
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Subject / Title
              </label>
              <input
                type="text"
                placeholder="e.g., Can I take a train instead of flight for Pune to Delhi?"
                value={newQuestionTitle}
                onChange={e => setNewQuestionTitle(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Details
              </label>
              <textarea
                placeholder="Describe your question or situation with any relevant dates or campuses..."
                rows={4}
                value={newQuestionContent}
                onChange={e => setNewQuestionContent(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setIsAsking(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateQuestion}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-md shadow-indigo-600/20"
              >
                Submit Question
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Main Grid: Question List & Active Thread */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: List of Questions */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              {filteredQuestions.length} Inquiry{filteredQuestions.length !== 1 ? 'ies' : ''}
            </span>
            <div className="flex items-center gap-1">
              {['ALL', 'Open', 'Answered', 'Resolved'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  className={`px-2.5 py-1 text-2xs font-bold rounded-md transition-all ${
                    statusFilter === tab
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 max-h-[70vh] overflow-y-auto custom-scrollbar pr-1">
            {filteredQuestions.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
                No inquiries found under this filter.
              </div>
            ) : (
              filteredQuestions.map(q => {
                const isSelected = selectedQuestion?.id === q.id;
                return (
                  <div
                    key={q.id}
                    onClick={() => setSelectedQuestion(q)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-400 dark:border-indigo-600 shadow-sm'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white line-clamp-1">
                        {q.title}
                      </h4>
                      <span
                        className={`px-2 py-0.5 rounded-full text-3xs font-bold uppercase tracking-wider shrink-0 ${
                          q.status === 'Open'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                            : q.status === 'Answered'
                            ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400'
                            : q.status === 'Promoted to FAQ'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                        }`}
                      >
                        {q.status}
                      </span>
                    </div>
                    <p className="text-2xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {q.content}
                    </p>
                    <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-3xs text-slate-400">
                      <span>{q.employee_name}</span>
                      <span>{new Date(q.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Thread & Actions */}
        <div className="lg:col-span-7">
          {selectedQuestion ? (
            <Card className="p-6 border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
              {/* Question Header */}
              <div className="space-y-2 border-b dark:border-slate-800 pb-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">
                    Asked by {selectedQuestion.employee_name} ({selectedQuestion.employee_email})
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider ${
                        selectedQuestion.status === 'Open'
                          ? 'bg-amber-100 text-amber-700'
                          : selectedQuestion.status === 'Answered'
                          ? 'bg-sky-100 text-sky-700'
                          : selectedQuestion.status === 'Promoted to FAQ'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {selectedQuestion.status}
                    </span>

                    {/* Promote to FAQ button for PnC Admins */}
                    {isPncAdmin && (
                      <button
                        onClick={handleOpenPromoteModal}
                        className="px-2.5 py-1 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 rounded text-2xs font-bold hover:bg-purple-100 transition-colors flex items-center gap-1"
                      >
                        <i className="fa-solid fa-star text-3xs"></i>
                        Promote to FAQ
                      </button>
                    )}
                  </div>
                </div>

                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {selectedQuestion.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-lg border border-slate-100 dark:border-slate-800">
                  {selectedQuestion.content}
                </p>

                {/* Status action toggles */}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-3xs text-slate-400">
                    {new Date(selectedQuestion.created_at).toLocaleString()}
                  </span>
                  <div className="flex items-center gap-2">
                    {selectedQuestion.status !== 'Resolved' && (
                      <button
                        onClick={() => handleUpdateStatus('Resolved')}
                        className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-2xs font-bold hover:bg-emerald-100"
                      >
                        <i className="fa-solid fa-check mr-1"></i> Mark Resolved
                      </button>
                    )}
                    {selectedQuestion.status === 'Resolved' && (
                      <button
                        onClick={() => handleUpdateStatus('Open')}
                        className="px-3 py-1 bg-slate-100 text-slate-600 rounded text-2xs font-bold hover:bg-slate-200"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Discussion Thread */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
                    <i className="fa-solid fa-comments text-indigo-600"></i>
                    Inquiry Thread ({replies.length})
                  </h4>
                  {replies.length > 0 && (
                    <span className="text-3xs text-slate-400 font-medium">
                      {replies.filter(r => r.author_role === 'PNC' || r.author_role === 'PNC Admin' || r.author_role === 'Admin').length} Responses • {replies.filter(r => r.author_role !== 'PNC' && r.author_role !== 'PNC Admin' && r.author_role !== 'Admin').length} Follow-ups
                    </span>
                  )}
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                  {replies.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-xs italic bg-slate-50 dark:bg-slate-800/20 rounded border border-dashed border-slate-200 dark:border-slate-800">
                      {isDeskStaff
                        ? 'No responses yet. Type your response below to assist the employee.'
                        : 'No responses yet from PnC Desk. You can post a follow-up note below if you have additional details.'}
                    </div>
                  ) : (
                    replies.map(r => {
                      const isPncResponse =
                        r.author_role === 'PNC' ||
                        r.author_role === 'PNC Admin' ||
                        r.author_role === 'Admin' ||
                        r.author_role === UserRole.PNC ||
                        r.author_role === UserRole.PNC_ADMIN ||
                        r.author_role === UserRole.ADMIN;

                      return (
                        <div
                          key={r.id}
                          className={`p-3.5 rounded-lg border space-y-1 text-xs ${
                            isPncResponse
                              ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200/80 dark:border-indigo-900/60'
                              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 dark:text-slate-200">{r.author_name}</span>
                              {isPncResponse ? (
                                <span className="px-2 py-0.5 rounded text-3xs font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                  Response
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-3xs font-semibold bg-slate-200/70 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border border-slate-300/80 dark:border-slate-600">
                                  Follow-up
                                </span>
                              )}
                            </div>
                            <span className="text-3xs text-slate-400 font-mono">
                              {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                            {r.reply_text}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Reply / Follow-up Input */}
                <div className="space-y-2 pt-2">
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder={
                      isDeskStaff
                        ? "Type your response to the employee..."
                        : "Ask a follow-up question or provide more details..."
                    }
                    rows={3}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleSendReply}
                      disabled={isSubmittingReply || !replyText.trim()}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                    >
                      <i className={`fa-solid ${isDeskStaff ? 'fa-paper-plane' : 'fa-reply'} text-2xs`}></i>
                      {isDeskStaff ? 'Send Response' : 'Send Follow-up'}
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs p-6 text-center">
              <i className="fa-solid fa-comments text-3xl mb-2 text-slate-300 dark:text-slate-700"></i>
              <p className="font-semibold text-slate-500">Select an inquiry from the left to view the thread</p>
            </div>
          )}
        </div>
      </div>

      {/* Promote to FAQ Modal */}
      {promoteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setPromoteModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <i className="fa-solid fa-star text-purple-600"></i>
              Publish as Guide FAQ
            </h3>
            <p className="text-xs text-slate-500">
              This will add this verified Q&A to the employee Travel Guide FAQ section for all employees to see.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  FAQ Question
                </label>
                <input
                  type="text"
                  value={faqQuestion}
                  onChange={e => setFaqQuestion(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  FAQ Answer
                </label>
                <textarea
                  rows={4}
                  value={faqAnswer}
                  onChange={e => setFaqAnswer(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Category
                </label>
                <select
                  value={faqCategory}
                  onChange={e => setFaqCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none"
                >
                  <option value="General">General</option>
                  <option value="Booking">Booking & Advances</option>
                  <option value="Policy">Policy & Approvals</option>
                  <option value="Reimbursement">Reimbursement & Invoices</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setPromoteModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handlePromoteToFaq}
                disabled={isPromoting}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shadow-md shadow-purple-600/20"
              >
                {isPromoting ? 'Publishing...' : 'Publish to Guide FAQ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AskPncView;
