import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import Game from './Game';
import Fallback from './Fallback';
import { BrowserRouter, Routes, Route } from "react-router-dom";

let webSocket = new WebSocket(`ws://localhost:8080`);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <BrowserRouter>
      <Routes>
        <Route exact path="/" element={<App ws={webSocket} />} />
        <Route exact path="/game" element={<Game ws={webSocket} />} />
        <Route path="*" element={<Fallback />} />  {/* Fallback */}
      </Routes>
    </BrowserRouter>
);