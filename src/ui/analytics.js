// Google Analytics, on the live site only, so local testing isn't counted.
// It's on by default; the title screen discloses it and has an off button.

const MEASUREMENT_ID = 'G-KZ0X048249';
const LIVE_HOST = 'yahavya.github.io';
const CHOICE_KEY = 'final-approach-analytics';

const isOff = () => {
  try { return localStorage.getItem(CHOICE_KEY) === 'declined'; } catch { return false; }
};
const setOff = (off) => {
  try { localStorage.setItem(CHOICE_KEY, off ? 'declined' : 'on'); } catch { /* resets next visit */ }
};

export function createAnalytics() {
  const enabled = location.hostname === LIVE_HOST;
  const notice = document.getElementById('analytics-notice');
  const toggle = document.getElementById('analytics-toggle');
  let gtag = null;
  if (!notice || !toggle) return { event() {} };

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

  function show() {
    notice.hidden = !enabled;
    toggle.textContent = isOff() ? 'Turn on' : 'Turn off';
  }

  toggle.addEventListener('click', () => {
    const turningOff = !isOff();
    setOff(turningOff);
    // Turning it off has to stop the tag that's already running, so reload.
    if (turningOff) location.reload();
    else { load(); show(); }
  });

  if (enabled && !isOff()) load();
  show();

  return {
    /** Records a game event. Does nothing when analytics is off. */
    event(name, params = {}) {
      if (gtag) gtag('event', name, params);
    },
  };
}
