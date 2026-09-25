// Lazily wires the real dependencies for the SvelteKit routes.

import { loadConfig } from './config.js';
import { createPool, createMariaRepository } from './repository.js';
import { createProvider } from './provider/index.js';
import { createDiscordClient } from './discord.js';
import { createVerificationService } from './verification.js';

export const STATE_COOKIE = 'uowm_verify_state';

let services;

export function getServices() {
    if (!services) {
        const config = loadConfig();
        services = {
            config,
            verification: createVerificationService({
                config,
                repo: createMariaRepository(createPool(config.db)),
                provider: createProvider(config),
                discord: createDiscordClient(config.discord),
            }),
        };
    }
    return services;
}
