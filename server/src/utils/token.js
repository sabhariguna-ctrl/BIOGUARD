import jwt from 'jsonwebtoken';
const secret = () => process.env.JWT_SECRET || 'dev_secret';
export const signAccess = (u) =>
  jwt.sign({ id: u._id.toString(), role: u.role, name: u.name, v: u.tokenVersion || 0 }, secret(), { expiresIn: '6h' });
// short-lived token proving the user just passed multimodal verification
export const signPass = (userId) => jwt.sign({ id: userId.toString(), purpose: 'pass' }, secret(), { expiresIn: '5m' });
export const verifyToken = (t) => jwt.verify(t, secret());
