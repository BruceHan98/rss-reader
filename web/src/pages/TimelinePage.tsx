import { BookOpen } from 'lucide-react';

export default function TimelinePage() {
  return (
    <div className="hidden md:flex flex-1 items-center justify-center h-full bg-[#FFFFFF] dark:bg-[#202124]">
      <div className="flex flex-col items-center gap-6 text-[#717784] dark:text-[#959CA8] px-8 text-center">
        <div className="empty-state-icon w-20 h-20">
          <BookOpen size={30} />
        </div>
        <p className="text-sm">选择文章</p>
      </div>
    </div>
  );
}
