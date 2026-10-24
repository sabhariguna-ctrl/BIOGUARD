import axios from 'axios';
import { useAuth } from '../store/auth.js';

export const api = axios.create({ baseURL: (import.meta.env.VITE_API_URL || '') + '/api' });
api.interceptors.request.use((cfg) => {
  const t = useAuth.getState().token;
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && useAuth.getState().token) useAuth.getState().logout();
    err.friendly = err.response?.data?.message || (err.code === 'ERR_NETWORK' ? 'Cannot reach the server. Is the backend running?' : err.message);
    return Promise.reject(err);
  }
);
