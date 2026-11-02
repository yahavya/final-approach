// Google Analytics, loaded only after a visitor accepts, and only on the live
// site, so local testing isn't counted. Without consent nothing is sent at all.

const MEASUREMENT_ID = 'G-KZ0X048249';
const LIVE_HOST = 'yahavya.github.io';
const CHOICE_KEY = 'final-approach-analytics';

const readChoice = () => {
  try { return localStorage.getItem(CHOICE_KEY); } catch { return null; }
};
const writeChoice = (choice) => {
  try { localStorage.setItem(CHOICE_KEY, choice); } catch { /* it asks again next time */ }
};

export function createAnalytics() {
  const enabled = !!MEASUREMENT_ID && location.hostname === LIVE_HOST;
  const bar = document.getElementById('consent');
  const toggle = document.getElementById('consent-toggle');
  let gtag = null;

  function load() {
    if (gtag) return;
    window.dataLayer = window.dataLayer || [];
    gtag = function gtagShim() { window.dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID);
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    document.head.append(script);
  }

  let onTitle = true;

  function show() {
    const choice = readChoice();
    bar.classList.toggle('show', enabled && !choice && onTitle);
    toggle.hidden = !enabled || !choice;
    toggle.textContent = choice === 'accepted' ? 'Analytics on: turn off' : 'Analytics off: turn on';
  }

  function choose(choice) {
    const wasOn = readChoice() === 'accepted';
    writeChoice(choice);
    if (choice === 'accepted') load();
    // Turning it off has to drop the cookies Google already set, so reload.
    else if (wasOn) location.reload();
    show();
  }

  document.getElementById('consent-accept').addEventListener('click', () => choose('accepted'));
  document.getElementById('consent-decline').addEventListener('click', () => choose('declined'));
  toggle.addEventListener('click', () => choose(readChoice() === 'accepted' ? 'declined' : 'accepted'));

  if (enabled && readChoice() === 'accepted') load();
  show();

  return {
    /** The prompt only appears on the title screen, never over a flight. */
    setOnTitle(value) {
      onTitle = value;
      show();
    },

    /** Records a game event. Does nothing without consent. */
    event(name, params = {}) {
      if (gtag) gtag('event', name, params);
    },
  };
}
