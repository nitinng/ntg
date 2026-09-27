import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';

interface NavbarProps {
  currentUser: User;
  baseRole: UserRole | null;
  onToggleRole: (role: UserRole) => void;
  onOpenProfile: () => void;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const Navbar = ({
  currentUser,
  baseRole,
  onToggleRole,
  onOpenProfile,
  onToggleSidebar,
  isSidebarOpen,
  isDarkMode,
  onToggleTheme
}: NavbarProps) => {
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.role-dropdown-container')) {
        setIsRoleDropdownOpen(false);
      }
    };
    if (isRoleDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isRoleDropdownOpen]);

  const getVisibleRoles = () => {
    if (baseRole === UserRole.ADMIN) return Object.values(UserRole);
    if (baseRole === UserRole.PNC) return [UserRole.EMPLOYEE, UserRole.PNC, UserRole.FINANCE];
    if (baseRole === UserRole.FINANCE) return [UserRole.EMPLOYEE, UserRole.FINANCE];
    return [];
  };

  const visibleRoles = getVisibleRoles();

  return (
    <nav className="h-16 app-navbar bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between sticky top-0 z-40 transition-colors duration-200">
      <div className="flex items-center">
        {onToggleSidebar && (
          <button onClick={onToggleSidebar} className="md:hidden w-8 h-8 flex items-center justify-center text-slate-500 hover:text-indigo-600 transition-colors flex-shrink-0 mr-3">
            <i className={`fa-solid ${isSidebarOpen ? 'fa-xmark' : 'fa-bars'} text-xl`}></i>
          </button>
        )}
        <div className="flex items-center gap-3 md:w-[calc(16rem-1.5rem)] flex-shrink-0">
          <img
            src="/ng-icon.png"
            alt="NavGurukul Logo"
            className="w-8 h-8 rounded-lg object-contain flex-shrink-0"
          />
          <h1 className="text-base font-bold text-slate-800 dark:text-slate-100 tracking-tight whitespace-nowrap">
            NG Travel Desk
          </h1>
        </div>
        {visibleRoles.length > 0 && (
          <>
            {/* Desktop standard role tabs - starts beyond the sidenav line */}
            <div className="hidden md:flex ml-6 gap-1 p-1 bg-slate-100 dark:bg-slate-950 border border-transparent dark:border-slate-800/80 rounded-lg transition-colors duration-200">
              {visibleRoles.map(role => (
                <button
                   key={role}
                   onClick={() => onToggleRole(role)}
                   className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all duration-200 ${
                     currentUser.role === role
                       ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-300 shadow-sm dark:shadow-sm border border-slate-200/60 dark:border-slate-800 font-black'
                       : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-900/50'
                   }`}
                >
                  {role}
                </button>
              ))}
            </div>

            {/* Mobile custom dropdown */}
            <div className="ml-2 md:hidden relative role-dropdown-container">
              <button
                onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                className="flex items-center justify-between min-w-[100px] bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-300 text-xs sm:text-xs font-black uppercase tracking-widest py-1.5 pl-3.5 pr-2.5 rounded-full outline-none shadow-sm shadow-indigo-500/5 border border-slate-200 dark:border-slate-700/80 hover:border-indigo-300 dark:hover:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all duration-200"
              >
                <span>{currentUser.role}</span>
                <div className="w-4 h-4 ml-2 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center transition-colors">
                  <i className={`fa-solid fa-chevron-${isRoleDropdownOpen ? 'up' : 'down'} text-[8px] text-indigo-500 dark:text-indigo-400 transition-transform`}></i>
                </div>
              </button>

              {/* Dropdown Menu */}
              {isRoleDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-[140px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl shadow-slate-900/10 dark:shadow-black/40 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-1.5 flex flex-col gap-0.5">
                    {visibleRoles.map(role => (
                      <button
                        key={role}
                        onClick={() => {
                          onToggleRole(role);
                          setIsRoleDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs sm:text-xs font-black uppercase tracking-widest transition-all duration-200 flex items-center justify-between group ${
                          currentUser.role === role
                            ? 'bg-indigo-50 dark:bg-slate-900 text-indigo-600 dark:text-indigo-300 dark:border dark:border-slate-800'
                            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-800 dark:hover:text-slate-100'
                        }`}
                      >
                        {role}
                        {currentUser.role === role && (
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleTheme}
          className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-amber-400 flex items-center justify-center hover:bg-indigo-100 dark:hover:bg-slate-700/80 border border-slate-200/80 dark:border-slate-800 transition-all duration-200 shadow-sm"
          aria-label="Toggle Dark Mode"
        >
          <i className={`fa-solid ${isDarkMode ? 'fa-sun' : 'fa-moon'} text-lg`}></i>
        </button>

        <div className="flex items-center gap-3 pl-4 border-l border-slate-200 dark:border-slate-800 transition-colors duration-200">
          <div className="text-right hidden sm:block">
            <p className="text-base font-bold text-slate-800 dark:text-white leading-none">{currentUser.name}</p>
            <p className="text-xs text-slate-500 mt-1 uppercase tracking-tighter font-medium">{currentUser.role} View</p>
          </div>
          <button
            onClick={onOpenProfile}
            className="w-10 h-10 bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 font-bold rounded-lg overflow-hidden border border-slate-200/80 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-slate-700 flex items-center justify-center transition-all"
          >
            {currentUser.avatar ? (
              <img src={currentUser.avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : currentUser.passportPhoto?.fileUrl ? (
              <img src={currentUser.passportPhoto.fileUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              currentUser.name.charAt(0)
            )}
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
