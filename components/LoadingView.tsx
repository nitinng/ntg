import React, { useState, useEffect } from 'react';

export const LoadingView: React.FC = () => {
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % 5);
    }, 750);
    return () => clearInterval(timer);
  }, []);

  const renderContent = () => {
    switch (slideIndex) {
      case 0:
        return (
          <div className="w-full h-full flex items-center justify-center bg-rose-500 text-white animate-in slide-in-from-right duration-500">
            <i className="fa-solid fa-heart text-2xl"></i>
          </div>
        );
      case 1:
        return (
          <div className="w-full h-full flex items-center justify-center bg-indigo-600 text-white animate-in slide-in-from-right duration-500">
            <span className="font-black text-2xl">N</span>
          </div>
        );
      case 2:
        return (
          <div className="w-full h-full flex items-center justify-center bg-sky-500 text-white animate-in slide-in-from-right duration-500">
            <i className="fa-solid fa-plane text-2xl"></i>
          </div>
        );
      case 3:
        return (
          <div className="w-full h-full flex items-center justify-center bg-emerald-500 text-white animate-in slide-in-from-right duration-500">
            <i className="fa-solid fa-train text-2xl"></i>
          </div>
        );
      case 4:
        return (
          <div className="w-full h-full flex items-center justify-center bg-amber-500 text-white animate-in slide-in-from-right duration-500">
            <i className="fa-solid fa-bus text-2xl"></i>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 animate-in fade-in duration-500">
      <div className="flex flex-col items-center gap-8">
        <div className="relative">
          {/* Spinning Rings */}
          <div className="absolute -inset-4 rounded-full border-4 border-slate-200 dark:border-slate-800"></div>
          <div
            className={`absolute -inset-4 rounded-full border-4 border-t-transparent animate-spin transition-colors duration-500 ${
              slideIndex === 0
                ? 'border-rose-500'
                : slideIndex === 1
                ? 'border-indigo-600'
                : slideIndex === 2
                ? 'border-sky-500'
                : slideIndex === 3
                ? 'border-emerald-500'
                : 'border-amber-500'
            }`}
          ></div>

          {/* Icon Slider Window */}
          <div className="w-12 h-12 rounded-lg overflow-hidden shadow-2xl shadow-indigo-600/30 relative z-10 bg-white dark:bg-slate-900">
            {renderContent()}
          </div>
        </div>

        <div className="text-center space-y-2">
          <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">NG Travel Desk</h3>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Loading...</p>
        </div>
      </div>
    </div>
  );
};

export default LoadingView;
