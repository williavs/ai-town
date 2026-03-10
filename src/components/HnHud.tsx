import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Id } from '../../convex/_generated/dataModel';

type Tab = 'trending' | 'discussions' | 'social';

export default function HnHud({ worldId }: { worldId?: Id<'worlds'> }) {
  const [tab, setTab] = useState<Tab>('trending');
  const [expandedStory, setExpandedStory] = useState<number | null>(null);
  const [expandedConvo, setExpandedConvo] = useState<string | null>(null);
  const stories = useQuery(api.hn.listTopStories);
  const discussions = useQuery(
    api.hn.storyDiscussions,
    worldId ? { worldId } : 'skip',
  );
  const relationships = useQuery(
    api.hn.agentRelationships,
    worldId ? { worldId } : 'skip',
  );

  if (!stories || stories.length === 0) return null;

  const hnLink = (hnId: number) => `https://news.ycombinator.com/item?id=${hnId}`;

  const timeAgo = (ts: number) => {
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="absolute top-3 right-3 z-10 pointer-events-auto">
      <div
        className="bg-black/70 backdrop-blur-sm rounded-lg overflow-hidden"
        style={{ border: '1px solid rgba(255,255,255,0.1)', maxWidth: 340, minWidth: 260 }}
      >
        {/* Tab bar */}
        <div className="flex border-b border-white/10 px-3 pt-2 pb-1 gap-3">
          {(['trending', 'discussions', 'social'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setExpandedStory(null); setExpandedConvo(null); }}
              className={`text-[9px] uppercase tracking-[1.5px] font-bold pb-1 transition-colors border-b-2 ${
                tab === t
                  ? 'text-orange-400 border-orange-400'
                  : 'text-white/30 border-transparent hover:text-white/50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="px-3 py-2">
          {/* Trending tab */}
          {tab === 'trending' && (
            <div className="space-y-1.5">
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
              <div className="text-[8px] text-white/20 mt-1">
                AI residents discuss these topics
              </div>
            </div>
          )}

          {/* Discussions tab */}
          {tab === 'discussions' && discussions && (
            <div className="space-y-1">
              {discussions.map((story) => {
                const isOpen = expandedStory === story.hnId;
                const convoCount = story.conversations.length;
                return (
                  <div key={story.hnId}>
                    {/* Story header - click to expand */}
                    <button
                      onClick={() => {
                        setExpandedStory(isOpen ? null : story.hnId);
                        setExpandedConvo(null);
                      }}
                      className="w-full text-left group"
                    >
                      <div className="flex items-start gap-1.5">
                        <span className="text-[9px] text-white/20 mt-px shrink-0">
                          {isOpen ? '▾' : '▸'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] text-orange-400/80 group-hover:text-orange-300 font-bold leading-tight transition-colors">
                            {story.title}
                          </div>
                          <div className="text-[8px] text-white/25 mt-0.5">
                            {convoCount > 0
                              ? `${convoCount} conversation${convoCount > 1 ? 's' : ''}`
                              : 'no discussions yet'}
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Expanded: conversation list */}
                    {isOpen && convoCount > 0 && (
                      <div className="ml-3 mt-1 space-y-1 border-l border-white/10 pl-2">
                        {story.conversations.map((convo, ci) => {
                          const isConvoOpen = expandedConvo === convo.conversationId;
                          const participants = [
                            ...new Set(convo.messages.map((m) => m.authorName)),
                          ];
                          const preview = convo.messages[0]?.text.slice(0, 60) ?? '';
                          return (
                            <div key={convo.conversationId}>
                              {/* Conversation header */}
                              <button
                                onClick={() =>
                                  setExpandedConvo(isConvoOpen ? null : convo.conversationId)
                                }
                                className="w-full text-left group"
                              >
                                <div className="flex items-start gap-1">
                                  <span className="text-[8px] text-white/15 mt-px shrink-0">
                                    {isConvoOpen ? '▾' : '▸'}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[9px] text-white/50 font-medium">
                                      {participants.join(' & ')}
                                    </div>
                                    {!isConvoOpen && (
                                      <div className="text-[9px] text-white/25 truncate">
                                        {preview}...
                                      </div>
                                    )}
                                  </div>
                                  <span className="text-[8px] text-white/15 shrink-0">
                                    {convo.messages.length} msg{convo.messages.length > 1 ? 's' : ''}
                                  </span>
                                </div>
                              </button>

                              {/* Expanded: full conversation */}
                              {isConvoOpen && (
                                <div className="mt-1 ml-2 space-y-1 max-h-[200px] overflow-y-auto">
                                  {convo.messages.map((msg, mi) => (
                                    <div key={mi} className="text-[10px] leading-snug">
                                      <span className="text-orange-400/60 font-medium">
                                        {msg.authorName}
                                      </span>
                                      <span className="text-white/60 ml-1">{msg.text}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {isOpen && convoCount === 0 && (
                      <div className="ml-3 mt-1 text-[9px] text-white/20 pl-2 border-l border-white/10">
                        Agents haven't discussed this yet
                      </div>
                    )}
                  </div>
                );
              })}

              <a
                href="https://news.ycombinator.com"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-[8px] text-white/15 hover:text-white/30 mt-2 transition-colors"
              >
                via Hacker News
              </a>
            </div>
          )}

          {/* Social tab - agent relationship map */}
          {tab === 'social' && (
            <div className="space-y-1">
              {relationships && relationships.length > 0 ? (
                <>
                  {relationships.map((pair, i) => {
                    const maxCount = relationships[0].count;
                    const barWidth = Math.max(12, Math.round((pair.count / maxCount) * 100));
                    return (
                      <div key={i} className="group">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] text-white/70 leading-tight truncate">
                              <span className="text-orange-400/70 font-medium">{pair.name1}</span>
                              <span className="text-white/20 mx-1">&harr;</span>
                              <span className="text-orange-400/70 font-medium">{pair.name2}</span>
                            </div>
                          </div>
                          <span className="text-[8px] text-white/25 shrink-0 tabular-nums">
                            {pair.count}x
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <div className="flex-1 h-[3px] bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-orange-400/40 rounded-full"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <span className="text-[7px] text-white/15 shrink-0">
                            {timeAgo(pair.lastTalked)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div className="text-[8px] text-white/20 mt-1">
                    Who talks to who most
                  </div>
                </>
              ) : (
                <div className="text-[9px] text-white/20">
                  No conversations recorded yet
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
