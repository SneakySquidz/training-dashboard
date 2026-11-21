// HRP story: the day-by-day timeline of the 2026 Pyrenees traverse (updates, located on the track, nights, looking back).
// The story is one self-contained page in story/index.html; this view shows it inside the dashboard and follows the theme.
import { $ } from './ui.js';

const SRC = 'story/index.html';

/** arg: an optional anchor inside the story, e.g. #story/day-6 opens day 6. */
export function renderStory(arg) {
  const el = $('#story');
  const hash = /^[a-z0-9-]+$/i.test(arg || '') ? '#' + arg : '';
  let frame = $('iframe', el);
  if (!frame) {
    el.innerHTML = `<div class="card" style="padding:0;overflow:hidden"><iframe title="Hendaye to Gavarnie: day-by-day story of the 2026 Pyrenees traverse" loading="lazy"
      style="display:block;width:100%;height:calc(100dvh - 170px);min-height:520px;border:0"></iframe></div>
      <p class="small muted mt">Updates as sent to the WhatsApp group, placed on the Garmin tracks. <a href="${SRC}" target="_blank" rel="noopener">Open on its own page</a></p>`;
    frame = $('iframe', el);
    frame.src = SRC + hash;
  } else if (hash) {
    frame.contentWindow?.location.replace(SRC + hash);
  }
}
