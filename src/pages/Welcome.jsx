import React from 'react';
import { useNavigate } from 'react-router-dom';

const Welcome = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#071A52] via-[#0b1226] to-black text-white px-6">
      <style>{`
        @keyframes floatY { 0% { transform: translateY(0px);} 50% { transform: translateY(-10px);} 100% { transform: translateY(0px);} }
        @keyframes floatX { 0% { transform: translateX(0px);} 50% { transform: translateX(8px);} 100% { transform: translateX(0px);} }
        .float-y { animation: floatY 4s ease-in-out infinite; }
        .float-x { animation: floatX 5s ease-in-out infinite; }
        .fade-in { animation: fadeIn 0.8s ease both; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div className="relative max-w-6xl w-full rounded-3xl p-8 md:p-12 bg-gradient-to-br from-white/3 to-white/2/10 backdrop-blur-sm border border-white/6 overflow-hidden">
        {/* Decorative floating blobs */}
        <div className="pointer-events-none absolute -left-32 -top-24 w-72 h-72 bg-indigo-700/40 rounded-full blur-3xl float-y" />
        <div className="pointer-events-none absolute -right-28 -bottom-20 w-96 h-96 bg-emerald-600/20 rounded-full blur-3xl float-x" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="space-y-6 z-10">
            <div className="flex items-center gap-3">
              <div className="h-20 w-20 rounded-xl bg-white/10 flex items-center justify-center text-4xl">📚</div>
              <div>
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">StudyTogether</h1>
                <p className="text-slate-300 mt-1">Collaborative study rooms, AI-powered study tools, and live sessions — all in one place.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <Feature title="Organize Groups" desc="Create, share files, and run sessions with your classmates." icon="🧩" />
              <Feature title="AI Study Tools" desc="Summaries, flashcards, and quizzes generated from your notes." icon="🤖" />
              <Feature title="Live Sessions" desc="Schedule meetings and join instantly with a click." icon="🎥" />
              <Feature title="Secure" desc="Built on Supabase with secure auth & storage." icon="🔒" />
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => navigate('/login')}
                aria-label="Start — go to login"
                className="inline-flex items-center gap-3 bg-gradient-to-r from-indigo-500 to-sky-500 px-6 py-3 rounded-full font-semibold shadow-xl transform hover:scale-[1.02] transition"
              >
                <span>Get Started</span>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 12h14M13 5l7 7-7 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>

              <button
                onClick={() => navigate('/register')}
                className="inline-flex items-center gap-2 bg-transparent border border-white/10 px-5 py-3 rounded-full text-sm text-slate-200 hover:bg-white/3 transition"
              >
                Create account
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-3">Free for classrooms and study groups — powered by Supabase and Groq.</p>
          </div>

          <div className="flex items-center justify-center z-10">
            <div className="relative w-full max-w-sm">
              <div className="rounded-2xl bg-gradient-to-tr from-white/5 to-white/3 p-6 shadow-2xl">
                {/* Inline lightweight illustration (books + laptop) */}
                <svg viewBox="0 0 260 200" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="g1" x1="0" x2="1">
                      <stop offset="0%" stopColor="#7C3AED" />
                      <stop offset="100%" stopColor="#06B6D4" />
                    </linearGradient>
                  </defs>
                  <rect x="12" y="40" rx="10" ry="10" width="236" height="120" fill="#0b1226" stroke="#ffffff22" />
                  <rect x="28" y="56" rx="6" width="204" height="80" fill="#071A52" />
                  <g className="float-y" transform="translate(90,70)">
                    <rect x="0" y="0" width="80" height="40" rx="4" fill="url(#g1)" />
                    <circle cx="64" cy="8" r="6" fill="#fff" opacity="0.2" />
                  </g>
                  <g className="float-x" transform="translate(40,120)">
                    <rect x="0" y="0" width="40" height="14" rx="2" fill="#06B6D4" />
                    <rect x="46" y="0" width="80" height="14" rx="2" fill="#7C3AED" />
                  </g>
                </svg>
              </div>
              <div className="mt-3 text-center text-xs text-slate-400">Instantly turn notes into study materials</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Feature = ({ title, desc, icon }) => (
  <div className="flex items-start gap-3 p-3 rounded-lg bg-white/3">
    <div className="h-10 w-10 rounded-lg bg-white/6 flex items-center justify-center text-xl">{icon}</div>
    <div>
      <div className="font-semibold">{title}</div>
      <div className="text-sm text-slate-300">{desc}</div>
    </div>
  </div>
);

export default Welcome;
