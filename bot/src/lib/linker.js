// Links a verified university identity to a Discord account and assigns the role.
// `discord` is an adapter (lib/discordAdapter.js), faked in tests.

function createLinker({ repo, discord, roles, logger = console }) {
    const adminMentions = () => [roles.adminRoleId, roles.moderatorRoleId].filter(Boolean);

    async function linkAccount(discordUserId, uniIdHash, affiliation) {
        const existing = await repo.findUserByDiscordId(discordUserId);
        if (existing) return { code: existing.uniIdHash === uniIdHash ? 'already_verified' : 'discord_already_linked' };

        const member = await discord.getMember(discordUserId);
        if (!member) return { code: 'not_in_guild' };

        if ((await repo.insertUser({ discordUserId, uniIdHash, affiliation })) === 'duplicate') {
            const owner = await repo.findUserByUniHash(uniIdHash);
            if (!owner || owner.discordUserId === discordUserId) return { code: 'already_verified' };
            await reportSecondAccount(discordUserId, owner.discordUserId);
            return { code: 'uni_account_in_use' };
        }

        const isStudent = affiliation === 'student';
        try {
            await discord.addRole(discordUserId, isStudent ? roles.studentRoleId : roles.professorRoleId, 'University email verified');
        } catch (err) {
            logger.error(`Adding role failed for ${discordUserId}, rolling back: ${err.message}`);
            await repo.deleteUser(discordUserId);
            return { code: 'error' };
        }

        await clearGuestStatus(discordUserId, member);

        const label = { student: 'φοιτητής', faculty: 'διδάσκων', staff: 'προσωπικό' }[affiliation];
        const ping = isStudent ? [] : adminMentions();
        await discord.adminLog({
            content: ping.map((id) => `<@&${id}>`).join(' ') || undefined,
            embeds: [{ color: 0x0d86e3, title: 'Νέα επιβεβαίωση', description: `Ο χρήστης <@${discordUserId}> επιβεβαιώθηκε ως ${label}.` }],
            allowedMentions: { parse: [], roles: ping },
        });

        return { code: isStudent ? 'verified_student' : 'verified_professor', affiliation };
    }

    async function clearGuestStatus(discordUserId, member) {
        if (roles.guestRoleId && member.roles.includes(roles.guestRoleId)) {
            try {
                await discord.removeRole(discordUserId, roles.guestRoleId, 'Guest verified with university email');
            } catch (err) {
                logger.warn(`Could not remove guest role from ${discordUserId}: ${err.message}`);
            }
        }
        const guest = await repo.getGuest(discordUserId);
        if (guest) {
            await discord.deleteMessage(roles.guestChannelId, guest.msgId);
            await repo.deleteGuest(discordUserId);
        }
    }

    async function reportSecondAccount(attemptingUserId, ownerUserId) {
        const ping = adminMentions();
        await discord.adminLog({
            content: ping.map((id) => `<@&${id}>`).join(' ') || undefined,
            embeds: [{
                color: 0xed4245,
                title: 'Προσπάθεια σύνδεσης δεύτερου λογαριασμού',
                description: `Ο χρήστης <@${attemptingUserId}> προσπάθησε να επιβεβαιωθεί με ιδρυματικό λογαριασμό που είναι ήδη συνδεδεμένος με τον χρήστη <@${ownerUserId}>.`,
            }],
            allowedMentions: { parse: [], roles: ping },
        });
        await discord.sendDM(ownerUserId, {
            color: 0xed4245,
            title: 'Ειδοποίηση ασφαλείας',
            description:
                'Κάποιος προσπάθησε να συνδέσει τον ιδρυματικό σας λογαριασμό με άλλον λογαριασμό Discord. Η προσπάθεια απορρίφθηκε.\n\n' +
                'Για να το κάνει χρειάστηκε κωδικό από το ιδρυματικό σας email. Αν δεν ήσασταν εσείς, αλλάξτε άμεσα τον κωδικό σας στο https://account.uowm.gr και ενημερώστε τους διαχειριστές.',
        });
    }

    return { linkAccount };
}

module.exports = { createLinker };
