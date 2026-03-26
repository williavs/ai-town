import { useRef, useState } from 'react';
import PixiGame from './PixiGame.tsx';

import { useElementSize } from 'usehooks-ts';
import { Stage } from '@pixi/react';
import { ConvexProvider, useConvex, useQuery } from 'convex/react';
import PlayerDetails from './PlayerDetails.tsx';
import ConversationExplorer from './ConversationExplorer.tsx';
import HnHud from './HnHud.tsx';
import { api } from '../../convex/_generated/api';
import { useWorldHeartbeat } from '../hooks/useWorldHeartbeat.ts';
import { useHistoricalTime } from '../hooks/useHistoricalTime.ts';
import { DebugTimeManager } from './DebugTimeManager.tsx';
import { GameId } from '../../convex/aiTown/ids.ts';
import { useServerGame } from '../hooks/serverGame.ts';

export const SHOW_DEBUG_UI = !!import.meta.env.VITE_SHOW_DEBUG_UI;

export default function Game({ embed }: { embed?: boolean }) {
  const convex = useConvex();
  const [selectedElement, setSelectedElement] = useState<{
    kind: 'player';
    id: GameId<'players'>;
  }>();
  const [sidebarMode, setSidebarMode] = useState<'player' | 'conversations'>('conversations');
  const [gameWrapperRef, { width, height }] = useElementSize();

  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const engineId = worldStatus?.engineId;

  const game = useServerGame(worldId);

  // Send a periodic heartbeat to our world to keep it alive.
  useWorldHeartbeat();

  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const { historicalTime, timeManager } = useHistoricalTime(worldState?.engine);

  const scrollViewRef = useRef<HTMLDivElement>(null);

  if (!worldId || !engineId || !game) {
    return null;
  }
  return (
    <>
      {SHOW_DEBUG_UI && <DebugTimeManager timeManager={timeManager} width={200} height={100} />}
      <div className={`mx-auto w-full max-w grid grid-rows-[200px_1fr] lg:grid-rows-[1fr] ${embed ? 'lg:grid-cols-[auto_1fr] h-full' : 'lg:grid-cols-[1fr_auto] max-w-[1400px] game-frame'} lg:grow min-h-[480px]`}>
        {/* Details panel - left in embed, right in standalone */}
        <div
          className={`flex flex-col overflow-hidden shrink-0 lg:w-80 xl:pr-0 bg-brown-800 text-brown-100 ${embed ? 'order-first border-b-8 sm:border-b-0 sm:border-r-8 border-brown-900' : 'border-t-8 sm:border-t-0 sm:border-l-8 border-brown-900'}`}
        >
          {/* Sidebar toggle */}
          <div className="flex border-b border-brown-700 shrink-0">
            <button
              onClick={() => setSidebarMode('conversations')}
              className={`flex-1 py-2 text-[10px] uppercase font-bold tracking-wider transition-colors ${
                sidebarMode === 'conversations'
                  ? 'text-brown-100 bg-brown-700/40'
                  : 'text-brown-500 hover:text-brown-300'
              }`}
            >
              Conversations
            </button>
            <button
              onClick={() => setSidebarMode('player')}
              className={`flex-1 py-2 text-[10px] uppercase font-bold tracking-wider transition-colors ${
                sidebarMode === 'player'
                  ? 'text-brown-100 bg-brown-700/40'
                  : 'text-brown-500 hover:text-brown-300'
              }`}
            >
              Player
            </button>
          </div>

          {sidebarMode === 'conversations' ? (
            <ConversationExplorer worldId={worldId} />
          ) : (
            <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4" ref={scrollViewRef}>
              <PlayerDetails
                worldId={worldId}
                engineId={engineId}
                game={game}
                playerId={selectedElement?.id}
                setSelectedElement={setSelectedElement}
                scrollViewRef={scrollViewRef}
              />
            </div>
          )}
        </div>
        {/* Game area */}
        <div className="relative overflow-hidden bg-brown-900" ref={gameWrapperRef}>
          <HnHud worldId={worldId} />
          <div className="absolute inset-0">
            <div className="container">
              <Stage width={width} height={height} options={{ backgroundColor: 0x7ab5ff }}>
                <ConvexProvider client={convex}>
                  <PixiGame
                    game={game}
                    worldId={worldId}
                    engineId={engineId}
                    width={width}
                    height={height}
                    historicalTime={historicalTime}
                    setSelectedElement={(el) => {
                      setSelectedElement(el);
                      if (el) setSidebarMode('player');
                    }}
                  />
                </ConvexProvider>
              </Stage>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
