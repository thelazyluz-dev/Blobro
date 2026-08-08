// One place for the outward-facing share message (link previews, the WhatsApp
// button). NB: this is EXTERNAL marketing copy, not in-game UI — so it's written
// without nikud (renders cleanest when pasted into WhatsApp across devices),
// unlike the in-app strings. The "googol" challenge + the first-five prize
// are the hook the owner is distributing around (the win bar was raised from a
// decillion to a googol, so the marketing copy names the googol now).

export const SHARE_URL = 'https://bl-or-bo.com/';

export const SHARE_TEXT =
  'בלורבו 🫧 מי הראשון שיגיע לגוגל? 🏆 חמשת הראשונים שמגיעים לגוגל — מתווספת דמות על שמם במשחק!';

/** wa.me deep link — opens the WhatsApp app on mobile, WhatsApp Web on desktop,
 * with the message + link prefilled for the user to pick a chat and send.
 * Pass the player's tracked invite link (referralLink(code)) so a friend who
 * joins through it is CREDITED to that player; falls back to the bare site URL
 * only when no code is available yet (never silently un-attributed once it is). */
export function whatsappShareUrl(link: string = SHARE_URL): string {
  return `https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${link}`)}`;
}
