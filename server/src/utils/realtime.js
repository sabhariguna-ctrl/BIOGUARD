let io = null;
export const setIo = (instance) => { io = instance; };
export const emitProctors = (event, payload) => io && io.to('proctors').emit(event, payload);
export const emitUser = (userId, event, payload) => io && io.to(`user:${userId}`).emit(event, payload);
