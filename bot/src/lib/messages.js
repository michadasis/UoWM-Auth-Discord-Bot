// User-facing results (Greek), keyed by the codes returned by lib/emailVerification.js.

const colors = { success: 0x57f287, info: 0x0d86e3, warning: 0xe67e22, error: 0xed4245 };

const messages = {
    verified_student: {
        tone: 'success',
        title: 'Επιτυχής επιβεβαίωση',
        text: 'Ο λογαριασμός σας επιβεβαιώθηκε και λάβατε τον ρόλο «Φοιτητής». Μπορείτε πλέον να επιλέξετε τα εξάμηνά σας στο κανάλι #epilogh-eksamhnou.',
    },
    verified_professor: {
        tone: 'success',
        title: 'Επιτυχής επιβεβαίωση',
        text: 'Ο λογαριασμός σας επιβεβαιώθηκε και λάβατε τον ρόλο «Καθηγητής».',
    },
    discord_verified: {
        tone: 'info',
        title: 'Ήδη επιβεβαιωμένος λογαριασμός',
        text: 'Ο λογαριασμός σας στο Discord είναι ήδη επιβεβαιωμένος. Αν θέλετε να τον αποσυνδέσετε, χρησιμοποιήστε την εντολή `/unverify`.',
    },
    already_verified: {
        tone: 'info',
        title: 'Ήδη επιβεβαιωμένος λογαριασμός',
        text: 'Ο λογαριασμός σας στο Discord είναι ήδη συνδεδεμένος με αυτόν τον ιδρυματικό λογαριασμό.',
    },
    discord_already_linked: {
        tone: 'warning',
        title: 'Ήδη συνδεδεμένος λογαριασμός Discord',
        text: 'Ο λογαριασμός σας στο Discord είναι ήδη συνδεδεμένος με άλλον ιδρυματικό λογαριασμό. Χρησιμοποιήστε πρώτα την εντολή `/unverify`.',
    },
    uni_account_in_use: {
        tone: 'error',
        title: 'Ο ιδρυματικός λογαριασμός χρησιμοποιείται ήδη',
        text: 'Αυτός ο ιδρυματικός λογαριασμός είναι ήδη συνδεδεμένος με άλλον λογαριασμό Discord. Κάθε ιδρυματικός λογαριασμός συνδέεται με έναν μόνο λογαριασμό Discord. Αν πιστεύετε ότι πρόκειται για λάθος, επικοινωνήστε με τους διαχειριστές.',
    },
    invalid_address: {
        tone: 'error',
        title: 'Μη έγκυρη διεύθυνση',
        text: 'Γράψτε το ιδρυματικό σας email (π.χ. `cs01234@uowm.gr`) ή μόνο το όνομα χρήστη (π.χ. `cs01234`).',
    },
    wrong_department: {
        tone: 'error',
        title: 'Μόνο για το Τμήμα Πληροφορικής',
        text: 'Ο διακομιστής απευθύνεται σε φοιτητές του Τμήματος Πληροφορικής (λογαριασμοί της μορφής `cs01234`). Αν πιστεύετε ότι πρόκειται για λάθος, επικοινωνήστε με τους διαχειριστές.',
    },
    not_eligible: {
        tone: 'error',
        title: 'Δεν είναι δυνατή η επιβεβαίωση',
        text: 'Η διεύθυνση δεν αντιστοιχεί σε φοιτητή ή διδάσκοντα του Τμήματος Πληροφορικής. Αν είστε διδάσκων και δεν αναγνωριστήκατε, επικοινωνήστε με τους διαχειριστές.',
    },
    not_in_guild: {
        tone: 'error',
        title: 'Δεν είστε μέλος του διακομιστή',
        text: 'Μπείτε πρώτα στον διακομιστή Discord «Πληροφορική UoWM» και δοκιμάστε ξανά.',
    },
    resend_too_soon: {
        tone: 'warning',
        title: 'Περιμένετε λίγο',
        text: 'Μόλις στάλθηκε κωδικός. Περιμένετε ένα λεπτό πριν ζητήσετε νέο.',
    },
    rate_limited: {
        tone: 'warning',
        title: 'Πολλές προσπάθειες',
        text: 'Έχουν σταλεί πολλοί κωδικοί την τελευταία ώρα. Δοκιμάστε ξανά αργότερα.',
    },
    email_send_failed: {
        tone: 'error',
        title: 'Η αποστολή απέτυχε',
        text: 'Δεν ήταν δυνατή η αποστολή του email. Δοκιμάστε ξανά σε λίγο ή επικοινωνήστε με τους διαχειριστές.',
    },
    wrong_code: {
        tone: 'error',
        title: 'Λάθος κωδικός',
        text: 'Ο κωδικός δεν είναι σωστός.',
    },
    too_many_attempts: {
        tone: 'error',
        title: 'Πολλές λανθασμένες προσπάθειες',
        text: 'Ο κωδικός ακυρώθηκε μετά από πολλές λάθος προσπάθειες. Ζητήστε νέο με την εντολή `/auth`.',
    },
    no_pending_code: {
        tone: 'warning',
        title: 'Δεν υπάρχει ενεργός κωδικός',
        text: 'Ζητήστε πρώτα κωδικό με την εντολή `/auth email:cs01234@uowm.gr`.',
    },
    expired_code: {
        tone: 'warning',
        title: 'Ο κωδικός έληξε',
        text: 'Ο κωδικός ισχύει για 10 λεπτά. Ζητήστε νέο με την εντολή `/auth`.',
    },
    error: {
        tone: 'error',
        title: 'Κάτι πήγε στραβά',
        text: 'Παρουσιάστηκε σφάλμα. Δοκιμάστε ξανά αργότερα ή επικοινωνήστε με τους διαχειριστές.',
    },
};

function embedFor(result) {
    const msg = messages[result.code] ?? messages.error;
    let text = msg.text;
    if (result.code === 'wrong_code' && result.attemptsLeft !== undefined) text += ` Απομένουν ${result.attemptsLeft} προσπάθειες.`;
    return { color: colors[msg.tone], title: msg.title, description: text };
}

module.exports = { messages, embedFor, colors };
