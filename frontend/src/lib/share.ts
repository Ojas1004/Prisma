/** Social share intents for generated artifacts.
 *
 * The two platforms are NOT symmetric, which is why this module exists
 * instead of two inline <a> tags:
 *
 *   X/Twitter's web intent takes a `text` parameter, so the generated post
 *   travels in the URL and the composer opens prefilled. This works with no
 *   public site URL at all.
 *
 *   LinkedIn's `share-offsite` takes ONLY a `url` and ignores any text you
 *   pass — it renders a preview by crawling that URL's OG tags. Artifacts
 *   live in this app (localhost during development) and are not published
 *   anywhere crawlable, so there is no URL that would produce the post.
 *   Passing the site root would share the site, not the deliverable.
 *
 * So LinkedIn copies the body to the clipboard and opens its composer, where
 * the operator pastes. That is one extra action but actually shares the
 * deliverable, which the URL-only flow cannot do.
 */

/** X/Twitter counts a link as 23 chars regardless of length, and caps a post
 * at 280. Leave room for the ellipsis when trimming. */
const X_LIMIT = 280;

/** Public URL for this deployment, when there is one. Empty during local
 * development — every share path below works without it. */
export const SITE_URL = (import.meta.env.VITE_PUBLIC_SITE_URL ?? "").trim();

/** Trim to X's limit on a word boundary so a shared post never ends
 * mid-word. Returns the text unchanged when it already fits. */
export function fitForX(text: string, reserve = 0): string {
  const budget = X_LIMIT - reserve;
  const clean = text.trim();
  if (clean.length <= budget) return clean;
  const cut = clean.slice(0, budget - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > budget * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

/** X/Twitter web intent, prefilled with the post text.
 *
 * `url` is appended only when a public site URL is configured; X reserves 23
 * characters for it, so the text budget shrinks accordingly. */
export function xShareUrl(text: string): string {
  const params = new URLSearchParams();
  params.set("text", fitForX(text, SITE_URL ? 24 : 0));
  if (SITE_URL) params.set("url", SITE_URL);
  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

/** LinkedIn composer. Without a crawlable URL, `share-offsite` has nothing to
 * render, so the plain composer is opened and the body is pasted from the
 * clipboard (see shareToLinkedIn). When a public URL IS configured we use
 * share-offsite, which is what it is designed for. */
export function linkedInShareUrl(): string {
  if (SITE_URL) {
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(SITE_URL)}`;
  }
  return "https://www.linkedin.com/feed/?shareActive=true";
}

/** Copy text, returning whether it worked.
 *
 * navigator.clipboard needs a secure context: it is available on localhost
 * and HTTPS but not on a plain-HTTP LAN address, so fall back to a hidden
 * textarea + execCommand rather than silently failing there. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or API unavailable — fall through.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Copy the post, then open LinkedIn's composer in a new tab.
 *
 * Order matters: the copy happens first so the clipboard is ready by the time
 * the composer has focus. Returns whether the copy succeeded, so the caller
 * can tell the operator to paste (or that they will need to copy manually).
 */
export async function shareToLinkedIn(text: string): Promise<boolean> {
  const copied = await copyText(text);
  window.open(linkedInShareUrl(), "_blank", "noopener,noreferrer");
  return copied;
}
