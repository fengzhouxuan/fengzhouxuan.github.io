import { createVideoQuery } from './query.js';

const query = createVideoQuery();

export default {
  fetch(request, env = {}) {
    return query(request, { allowedOrigins: (env.VIDEO_ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()) });
  },
};
