import { resultMessages, messageFor } from '$lib/messages.js';

export function load({ url }) {
    const code = url.searchParams.get('r');
    return { message: messageFor(code in resultMessages ? code : 'error') };
}
