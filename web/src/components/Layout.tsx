import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import Sidebar from './Sidebar';
import AiProgressFloat from './AiProgressFloat';
import { ChevronLeft, ChevronRight, Library, CircleDot, Search, SlidersHorizontal, Newspaper } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Layout({ children }: { children: ReactNode }) {
  const { sidebarOpen, setSidebarOpen, feeds, filter, setFilter, immersiveMode } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  
  function navTo(type: 'all' | 'unread', path: string) {
    setFilter({ type });
    navigate(path);
    setSidebarOpen(false);
  }

  return (
    <div className="flex overflow-hidden bg-[#F7F8FA] dark:bg-[#17181A]" style={{height: "100dvh"}}>
      <AiProgressFloat />
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#242424]/30 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className={`
          relative flex-shrink-0
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'lg:w-[256px]' : 'lg:w-3'}
        `}
      >
        <aside
          className={`
            fixed lg:static inset-y-0 left-0 z-50 lg:z-30
            sidebar-surface w-[256px] h-full flex flex-col
            bg-[#F7F8FA] border-r border-[#E8EBF0]/50
            transform transition-all duration-300 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:border-r-0 lg:overflow-hidden'}
          `}
        >
          <Sidebar />
        </aside>

        <div
          onClick={() => setSidebarOpen(!sidebarOpen)}
        className="hidden lg:block absolute inset-y-0 right-0 z-40 w-3 cursor-col-resize group"
      >
        <div className="absolute inset-y-0 right-0 w-0.5 bg-transparent group-hover:bg-[#3478F6]/35 dark:group-hover:bg-[#82AEFF]/35 transition-colors duration-150" />
        <div className={`
            fixed top-1/2 -translate-y-1/2 z-50
            transition-all duration-300 ease-in-out
            ${sidebarOpen ? 'left-[256px]' : 'left-[2px]'}
            flex items-center gap-1.5 pointer-events-none
          `}>
            <div className="w-3.5 h-6 rounded-r-full bg-[#E8EBF0]/0 group-hover:bg-[#3478F6]/15 dark:group-hover:bg-[#82AEFF]/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-150">
              {sidebarOpen ? <ChevronLeft size={9} className="text-[#3478F6] dark:text-[#82AEFF]" /> : <ChevronRight size={9} className="text-[#3478F6] dark:text-[#82AEFF]" />}
            </div>
            <div className="px-2 py-1 rounded-md bg-[#242424]/82 dark:bg-[#E5E7EB]/10 text-[#FFFFFF] dark:text-[#B1B6C0] text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all duration-150 select-none">
              {sidebarOpen ? 'collapse' : 'expand'}
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#F7F8FA] dark:bg-[#17181A]">
        <div className="flex-1 overflow-hidden">{children}</div>

        {/* Mobile bottom Tab navigation */}
        <nav
          className={cn(
            "mobile-tab-bar lg:hidden fixed bottom-0 left-0 right-0 border-t border-[#E8EBF0]/50 dark:border-[#33363D]/80 bg-[#FFFFFF]/95 dark:bg-[#17181A]/95 z-40 transition-[transform,opacity] duration-300 ease-in-out",
            immersiveMode ? "translate-y-full opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
          )}
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="flex items-stretch h-16">
            <BottomTabItem
              icon={<Library size={20} />}
              label="阅读"
              active={location.pathname === '/' && filter.type === 'all'}
              onClick={() => navTo('all', '/')}
            />
            <BottomTabItem
              icon={<CircleDot size={20} />}
              label="未读"
              active={location.pathname === '/' && filter.type === 'unread'}
              onClick={() => navTo('unread', '/')}
            />
            <BottomTabItem
              icon={<Newspaper size={20} />}
              label="日报"
              active={location.pathname === '/digest'}
              onClick={() => navigate('/digest')}
            />
            <BottomTabItem
              icon={<Search size={20} />}
              label="搜索"
              active={location.pathname === '/search'}
              onClick={() => navigate('/search')}
            />
            <BottomTabItem
              icon={<SlidersHorizontal size={20} />}
              label="设置"
              active={location.pathname === '/settings'}
              onClick={() => navigate('/settings')}
            />
          </div>
        </nav>
      </main>
    </div>
  );
}

function BottomTabItem({
  icon, label, badge, active, onClick,
}: {
  icon: ReactNode;
  label: string;
  badge?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex-1 flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-95 relative',
        active ? 'text-[#3478F6] dark:text-[#82AEFF]' : 'text-[#717784] dark:text-[#959CA8]'
      )}
    >
      <span className="relative flex items-center justify-center w-11 h-7">
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 -right-1.5 min-w-[1.1rem] h-[1.1rem] rounded-full bg-[var(--color-primary)] text-white text-[9px] font-bold flex items-center justify-center px-0.5">
            {badge > 999 ? '999+' : badge}
          </span>
        )}
      </span>

      <span className="text-[12px] leading-[18px] font-medium transition-colors duration-200">
        {label}
      </span>
    </button>
  );
}
