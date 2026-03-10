import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

export default function HnHud({ worldId }: { worldId?: Id<'worlds'> }) {
  const [tab, setTab] = useState<'trending' | 'discussions'>('trending');
  const stories = useQuery(api.hn.listTopStories);
  const discussions = useQuery(
    api.hn.storyDiscussions,
    worldId ? { worldId } : 'skip',
  );

  if (!stories || stories.length === 0) return null;

  const hnLink = (hnId: number) => `https://news.ycombinator.com/item?id=${hnId}`;

  return (
    <div className="absolute top-3 right-3 z-10 pointer-events-auto">
      <div
        className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 max-w-[320px]"
        style={{ border: '1px solid rgba(255,255,255,0.1)' }}
      >
        {/* Tabs */}
        <div className="flex gap-2 mb-1.5">
          <button
            onClick={() => setTab('trending')}
            className={`text-[9px] uppercase tracking-[1.5px] font-bold transition-colors ${
              tab === 'trending'
                ? 'text-orange-400'
                : 'text-white/30 hover:text-white/50'
            }`}
          >
            Trending
          </button>
          <span className="text-white/15 text-[9px]">|</span>
          <button
            onClick={() => setTab('discussions')}
            className={`text-[9px] uppercase tracking-[1.5px] font-bold transition-colors ${
              tab === 'discussions'
                ? 'text-orange-400'
                : 'text-white/30 hover:text-white/50'
            }`}
          >
            Discussions
          </button>
        </div>

        {tab === 'trending' && (
          <div className="space-y-1">
            {stories.map((story) => (
              <a
                key={story.hnId}
                href={hnLink(story.hnId)}
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
            <div className="text-[8px] text-white/20 mt-1.5">
              AI residents discuss these topics
            </div>
          </div>
        )}

        {tab === 'discussions' && (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {discussions && discussions.length > 0 ? (
              discussions.map((story) => (
                <div key={story.hnId}>
                  <a
                    href={hnLink(story.hnId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-orange-400/80 hover:text-orange-300 font-bold leading-tight block"
                  >
                    {story.title}
                  </a>
                  {story.discussions.length > 0 ? (
                    <div className="mt-0.5 space-y-0.5">
                      {story.discussions.map((msg, i) => (
                        <div key={i} className="text-[10px] leading-tight">
                          <span className="text-white/50">{msg.authorName}:</span>{' '}
                          <span className="text-white/70">{msg.text}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[9px] text-white/20 mt-0.5">
                      No discussions yet
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-[9px] text-white/30">Loading discussions...</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
