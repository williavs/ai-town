import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

export default function HnHud() {
  const stories = useQuery(api.hn.listTopStories);

  if (!stories || stories.length === 0) return null;

  return (
    <div className="absolute top-3 right-3 z-10 pointer-events-auto">
      <div
        className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 max-w-[280px]"
        style={{ border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <div className="text-[9px] uppercase tracking-[2px] text-orange-400/80 mb-1.5 font-bold">
          Trending on HN
        </div>
        <div className="space-y-1">
          {stories.map((story) => (
            <a
              key={story.hnId}
              href={story.url || `https://news.ycombinator.com/item?id=${story.hnId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
            >
              <div className="text-[11px] text-white/80 group-hover:text-orange-300 leading-tight transition-colors">
                {story.title}
              </div>
              <div className="text-[9px] text-white/30 mt-0.5">
                {story.score} pts &middot; {story.descendants} comments
              </div>
            </a>
          ))}
        </div>
        <div className="text-[8px] text-white/20 mt-1.5">
          AI residents discuss these topics
        </div>
      </div>
    </div>
  );
}
