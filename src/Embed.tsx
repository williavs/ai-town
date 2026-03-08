import Game from './components/Game.tsx';
import { ToastContainer } from 'react-toastify';
import InteractButton from './components/buttons/InteractButton.tsx';
import MusicButton from './components/buttons/MusicButton.tsx';
import helpImg from '../assets/help.svg';
import Button from './components/buttons/Button.tsx';
import { useEffect, useState } from 'react';
import ReactModal from 'react-modal';
import { MAX_HUMAN_PLAYERS } from '../convex/constants.ts';

export default function Embed() {
  const [helpModalOpen, setHelpModalOpen] = useState(false);

  useEffect(() => {
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
  }, []);

  return (
    <div className="flex flex-col w-full h-screen bg-transparent font-body overflow-hidden">
      <ReactModal
        isOpen={helpModalOpen}
        onRequestClose={() => setHelpModalOpen(false)}
        style={modalStyles}
        contentLabel="Help modal"
        ariaHideApp={false}
      >
        <div className="font-body">
          <h1 className="text-center text-4xl font-bold font-display game-title">Help</h1>
          <p className="mt-2">Click <b>Interact</b> to join the town. Click anywhere to move.</p>
          <p className="mt-2">Click on a character, then <b>Start conversation</b> to chat with them.</p>
          <p className="mt-2">Type your message and press Enter. Click <b>Leave conversation</b> when done.</p>
          <p className="mt-2 text-sm opacity-70">
            Max {MAX_HUMAN_PLAYERS} humans at a time. Idle players removed after 5 minutes.
          </p>
        </div>
      </ReactModal>

      <div className="flex-1 min-h-0">
        <Game embed />
      </div>

      <div className="flex items-center gap-3 px-4 py-2 flex-wrap bg-[#1a1a2e]">
        <InteractButton />
        <MusicButton />
        <Button imgUrl={helpImg} onClick={() => setHelpModalOpen(true)}>
          Help
        </Button>
      </div>

      <ToastContainer position="bottom-right" autoClose={2000} closeOnClick theme="dark" />
    </div>
  );
}

const modalStyles = {
  overlay: {
    backgroundColor: 'rgb(0, 0, 0, 75%)',
    zIndex: 12,
  },
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '80%',
    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
  },
};
