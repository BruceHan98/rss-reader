import { Leaf } from 'lucide-react';

export default function TimelinePage() {
  return (
    <div className="hidden md:flex flex-1 items-center justify-center h-full bg-[#FDFCF8]">
      <div className="flex flex-col items-center gap-5 text-[#78786C]">
        {/* Organic blob decoration */}
        <div className="relative">
          <div
            className="w-28 h-28 bg-[#E6DCCD]/50"
            style={{ borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%' }}
          />
          <div
            className="absolute top-4 left-4 w-20 h-20 bg-[#5D7052]/10"
            style={{ borderRadius: '40% 60% 70% 30% / 40% 70% 30% 60%' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Leaf size={28} className="text-[#5D7052]/50" />
          </div>
        </div>
        <div className="text-center">
          <p className="font-semibold text-sm text-[#4A4A40] mb-1">选择一篇文章</p>
          <p className="text-xs text-[#78786C]/70">开始沉浸式阅读</p>
        </div>
      </div>
    </div>
  );
}
