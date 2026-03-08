import React from 'react';
import ReactDOM from 'react-dom/client';
import Home from './App.tsx';
import Embed from './Embed.tsx';
import './index.css';
import 'uplot/dist/uPlot.min.css';
import 'react-toastify/dist/ReactToastify.css';
import ConvexClientProvider from './components/ConvexClientProvider.tsx';

const isEmbed = window.location.pathname.replace(/\/$/, '').endsWith('/embed');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexClientProvider>
      {isEmbed ? <Embed /> : <Home />}
    </ConvexClientProvider>
  </React.StrictMode>,
);
