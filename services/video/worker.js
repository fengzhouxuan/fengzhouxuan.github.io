import { createVideoQuery } from './query.js';
import { createAccountService } from './auth.js';

const query = createVideoQuery();
const accounts = createAccountService();

export default {
  fetch(request, env = {}) {
    if (new URL(request.url).pathname.startsWith('/api/account/')) return accounts(request, env);
    return query(request, { allowedOrigins: (env.VIDEO_ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()) });
  },
};
