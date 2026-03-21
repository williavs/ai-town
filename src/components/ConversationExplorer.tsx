import { useState } from 'react';
import { Id } from '../../convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

type ConvMessage = {
  id: string;
  author: string;
  text: string;
  time: number;
};

type ActiveConv = {
  id: string;
  participants: string[];
  numMessages: number;
  isTyping?: { playerId: string; messageUuid: string; since: number } | null;
  created: number;
  messages: ConvMessage[];
};

type ArchivedConv = {
  id: string;
  participants: string[];
  numMessages: number;
  created: number;
  ended: number;
  messages: ConvMessage[];
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function ConversationThread({
  conv,
  isActive,
  isExpanded,
  onToggle,
}: {
  conv: ActiveConv | ArchivedConv;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const lastMsg = conv.messages[conv.messages.length - 1];
  const endTime = 'ended' in conv ? conv.ended : Date.now();

  return (
    <div className="border-b border-brown-700/30 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full text-left px-2 py-2 hover:bg-brown-700/20 transition-colors"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {isActive && (
              <span className="w-2 h-2 rounded-full bg-green-400 shrink-0 animate-pulse" />
            )}
            <span className="text-[11px] font-semibold truncate">
              {conv.participants.join(' & ')}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[9px] text-brown-400">{conv.messages.length} msgs</span>
            <span className="text-[9px] text-brown-500">{timeAgo(endTime)}</span>
            <span className="text-[10px] text-brown-500">{isExpanded ? '▼' : '▶'}</span>
          </div>
        </div>
        {!isExpanded && lastMsg && (
          <p className="text-[10px] text-brown-400 truncate mt-0.5">
            <span className="font-medium text-brown-300">{lastMsg.author}:</span> {lastMsg.text}
          </p>
        )}
      </button>

      {isExpanded && (
        <div className="px-2 pb-2 max-h-[400px] overflow-y-auto">
          <div className="bg-brown-900/40 rounded p-2 space-y-1.5">
            {conv.messages.length === 0 ? (
              <p className="text-[10px] text-brown-500 italic">No messages yet</p>
            ) : (
              conv.messages.map((m) => (
                <div key={m.id} className="leading-tight">
                  <div className="flex gap-1.5 items-baseline">
                    <span className="text-[10px] font-semibold text-brown-200 uppercase">
                      {m.author}
                    </span>
                    <time className="text-[8px] text-brown-500">
                      {new Date(m.time).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  <p className="text-[11px] text-brown-300 leading-snug">{m.text}</p>
                </div>
              ))
            )}
            {isActive && (conv as ActiveConv).isTyping && (
              <p className="text-[10px] text-brown-500 italic">typing...</p>
            )}
          </div>
          {'ended' in conv && (
            <div className="flex justify-between text-[9px] text-brown-500 mt-1 px-1">
              <span>
                {new Date(conv.created).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
              <span>
                {Math.round((conv.ended - conv.created) / 60000)}m duration
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ConversationExplorer({ worldId }: { worldId: Id<'worlds'> }) {
  const data = useQuery(api.messages.allConversations, { worldId });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('all');

  if (!data) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-brown-500 text-xs">Loading conversations...</span>
      </div>
    );
  }

  const { active, archived } = data;
  const totalConvs = active.length + archived.length;
  const totalMsgs = [...active, ...archived].reduce((sum, c) => sum + c.messages.length, 0);

  const toggle = (id: string) => setExpandedId(expandedId === id ? null : id);

  const showActive = filter === 'all' || filter === 'active';
  const showArchived = filter === 'all' || filter === 'archived';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-brown-700">
        <h2 className="text-sm font-bold uppercase tracking-wide">Conversations</h2>
        <div className="flex gap-3 text-[10px] text-brown-400 mt-0.5">
          <span>{active.length} live</span>
          <span>{archived.length} archived</span>
          <span>{totalMsgs} total msgs</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-brown-700">
        {(['all', 'active', 'archived'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-1.5 text-[10px] uppercase font-semibold tracking-wide transition-colors ${
              filter === f
                ? 'text-brown-100 border-b-2 border-brown-300'
                : 'text-brown-500 hover:text-brown-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {totalConvs === 0 && (
          <p className="text-brown-500 text-xs text-center py-8">No conversations yet</p>
        )}

        {showActive && active.length > 0 && (
          <div>
            {filter === 'all' && (
              <div className="px-2 py-1 bg-green-900/20 border-b border-brown-700">
                <span className="text-[10px] font-semibold text-green-400 uppercase">
                  Live ({active.length})
                </span>
              </div>
            )}
            {active.map((conv) => (
              <ConversationThread
                key={`active-${conv.id}`}
                conv={conv}
                isActive={true}
                isExpanded={expandedId === conv.id}
                onToggle={() => toggle(conv.id)}
              />
            ))}
          </div>
        )}

        {showArchived && archived.length > 0 && (
          <div>
            {filter === 'all' && (
              <div className="px-2 py-1 bg-brown-700/30 border-b border-brown-700">
                <span className="text-[10px] font-semibold text-brown-400 uppercase">
                  Archived ({archived.length})
                </span>
              </div>
            )}
            {archived.map((conv) => (
              <ConversationThread
                key={`archived-${conv.id}`}
                conv={conv}
                isActive={false}
                isExpanded={expandedId === conv.id}
                onToggle={() => toggle(conv.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
