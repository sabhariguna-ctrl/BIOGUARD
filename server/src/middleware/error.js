import { ZodError } from 'zod';
export const notFound = (req, _res, next) => next(Object.assign(new Error(`Route not found: ${req.originalUrl}`), { status: 404 }));
export const errorHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  }
  if (err.code === 11000) return res.status(409).json({ message: 'That value is already in use' });
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id' });
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ message: status === 500 ? 'Something went wrong on the server' : err.message, ...(err.extra || {}) });
};
