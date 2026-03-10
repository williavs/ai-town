import Button from './Button';
import { toast } from 'react-toastify';
import interactImg from '../../../assets/interact.svg';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { ConvexError } from 'convex/values';
import { Id } from '../../../convex/_generated/dataModel';
import { useCallback, useState } from 'react';
import { waitForInput } from '../../hooks/sendInput';
import { useSessionId } from '../../hooks/useSessionId';
import { usePlayerName } from '../../hooks/usePlayerName';
import NameEntryModal from '../NameEntryModal';

export default function InteractButton() {
  const worldStatus = useQuery(api.world.defaultWorldStatus);
  const worldId = worldStatus?.worldId;
  const sessionId = useSessionId();
  const { savedName, saveName, clearName } = usePlayerName();
  const [showNameModal, setShowNameModal] = useState(false);
  const [joining, setJoining] = useState(false);

  // Use userStatus directly to check if playing -- no need for useServerGame.
  const humanTokenIdentifier = useQuery(
    api.world.userStatus,
    worldId ? { worldId, sessionId } : 'skip',
  );
  const worldState = useQuery(api.world.worldState, worldId ? { worldId } : 'skip');
  const isPlaying = !!(
    humanTokenIdentifier &&
    worldState?.world.players.find((p: any) => p.human === humanTokenIdentifier)
  );

  const join = useMutation(api.world.joinWorld);
  const leave = useMutation(api.world.leaveWorld);

  const convex = useConvex();
  const joinInput = useCallback(
    async (worldId: Id<'worlds'>, name: string) => {
      setJoining(true);
      let inputId;
      try {
        inputId = await join({ worldId, name, sessionId });
      } catch (e: any) {
        setJoining(false);
        if (e instanceof ConvexError) {
          toast.error(e.data);
          return;
        }
        throw e;
      }
      try {
        await waitForInput(convex, inputId);
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setJoining(false);
      }
    },
    [convex, sessionId],
  );

  const handleJoin = (name: string) => {
    if (!worldId) return;
    saveName(name);
    setShowNameModal(false);
    console.log(`Joining game as ${name}`);
    void joinInput(worldId, name);
  };

  const joinOrLeaveGame = () => {
    if (!worldId) {
      return;
    }
    if (joining) {
      return;
    }
    if (isPlaying) {
      console.log(`Leaving game`);
      clearName();
      void leave({ worldId, sessionId });
    } else if (savedName) {
      console.log(`Joining game as ${savedName}`);
      void joinInput(worldId, savedName);
    } else {
      setShowNameModal(true);
    }
  };

  const label = joining ? 'Joining...' : isPlaying ? 'Leave' : 'Interact';

  return (
    <>
      <Button imgUrl={interactImg} onClick={joinOrLeaveGame}>
        {label}
      </Button>
      <NameEntryModal
        isOpen={showNameModal}
        onClose={() => setShowNameModal(false)}
        onSubmit={handleJoin}
      />
    </>
  );
}
