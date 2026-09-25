import { getServices } from '$lib/server/services.js';

export function load() {
	return { authMode: getServices().config.provider === 'email' ? 'email' : 'sso' };
}
