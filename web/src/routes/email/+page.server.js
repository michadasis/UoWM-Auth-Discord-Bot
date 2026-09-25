import { fail, redirect } from '@sveltejs/kit';
import { getServices, STATE_COOKIE } from '$lib/server/services.js';
import { messageFor } from '$lib/messages.js';

// Codes that end the flow and go to the result page; everything else is shown on the form.
const TERMINAL = new Set(['invalid_link', 'expired', 'used', 'too_many_attempts', 'error']);

function services() {
    const s = getServices();
    if (!s.emailVerification) redirect(303, '/');
    return s;
}

function finish(cookies, config, code) {
    cookies.delete(STATE_COOKIE, { path: '/email', secure: config.secureCookies });
    redirect(303, `/result?r=${code}`);
}

export async function load({ cookies }) {
    const { config, emailVerification } = services();
    const token = cookies.get(STATE_COOKIE);
    if (!token) redirect(303, '/result?r=session_mismatch');

    const result = await emailVerification.begin(token);
    if (TERMINAL.has(result.code)) finish(cookies, config, result.code);
    return { stage: result.code === 'code_pending' ? 'code' : 'address', domain: config.email.domain };
}

export const actions = {
    send: async ({ request, cookies }) => {
        const { config, emailVerification } = services();
        const token = cookies.get(STATE_COOKIE);
        if (!token) redirect(303, '/result?r=session_mismatch');

        const address = (await request.formData()).get('address');
        let result;
        try {
            result = await emailVerification.sendCode(token, typeof address === 'string' ? address : '');
        } catch (err) {
            console.error('sendCode failed:', err);
            result = { code: 'error' };
        }

        if (TERMINAL.has(result.code)) finish(cookies, config, result.code);
        if (result.code === 'code_sent') return { stage: 'code', maskedAddress: result.maskedAddress };
        return fail(400, { stage: 'address', error: messageFor(result.code).text });
    },

    verify: async ({ request, cookies }) => {
        const { config, emailVerification } = services();
        const token = cookies.get(STATE_COOKIE);
        if (!token) redirect(303, '/result?r=session_mismatch');

        const code = (await request.formData()).get('code');
        let result;
        try {
            result = await emailVerification.verifyCode(token, typeof code === 'string' ? code : '');
        } catch (err) {
            console.error('verifyCode failed:', err);
            result = { code: 'error' };
        }

        if (result.code === 'wrong_code') {
            return fail(400, { stage: 'code', error: `${messageFor('wrong_code').text} Απομένουν ${result.attemptsLeft} προσπάθειες.` });
        }
        if (result.code === 'address_needed') return fail(400, { stage: 'address', error: messageFor('address_needed').text });
        finish(cookies, config, result.code);
    },
};
