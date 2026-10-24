import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster position="top-right" toastOptions={{ style: { background: 'rgb(var(--raised))', color: 'rgb(var(--ink))', border: '1px solid rgb(var(--line))' } }} />
    </BrowserRouter>
  </React.StrictMode>
);
