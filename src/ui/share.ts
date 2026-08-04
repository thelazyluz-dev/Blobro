// One place for the outward-facing share message (link previews, the WhatsApp
// button). NB: this is EXTERNAL marketing copy, not in-game UI — so it's written
// without nikud (renders cleanest when pasted into WhatsApp across devices),
// unlike the in-app strings. The "decillion" challenge + the first-five prize
// are the hook the owner is distributing around.

export const SHARE_URL = 'https://bl-or-bo.com/';

export const SHARE_TEXT =
  'בלורבו 🫧 מי הראשון שיגיע לדציליון? 🏆 חמשת הראשונים שמגיעים לדציליון — מתווספת דמות על שמם במשחק!';

/** wa.me deep link — opens the WhatsApp app on mobile, WhatsApp Web on desktop,
 * with the message + link prefilled for the user to pick a chat and send. */
export function whatsappShareUrl(): string {
  return `https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${SHARE_URL}`)}`;
}
