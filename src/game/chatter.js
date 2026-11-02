// What passengers say when you stop to talk. Lines depend on how the flight is
// going, and each passenger works through theirs, so pressing E again gets more.

const LINES = {
  afterFight: [
    'Captain, you were incredible! I saw everything.',
    'Thank you. My kids are in row 22. Thank you.',
    'Is he going to stay there the whole flight?',
    'I filmed the whole thing. Is that allowed?',
    'Wait, if you\'re back here, who\'s flying the plane?',
    'Do we still get the snack?',
    'I have never been so scared, or so glad to be on your flight.',
  ],
  scared: [
    'Please tell me you know how to fly this thing.',
    'Why is everything shaking? Is it supposed to shake?',
    'I\'d like to speak to the actual pilot.',
    'My coffee is on the ceiling.',
    'Shouldn\'t you be up front right now?',
  ],
  nervous: [
    'That was a bit bumpy. Everything okay up there?',
    'Could we maybe do less of that?',
    'I\'m fine. I\'m fine. Are you fine?',
    'Is that noise normal?',
  ],
  parked: [
    'Why aren\'t we moving?',
    'Excuse me, can you help with my bag?',
    'Is this seat 14C? It says 14C.',
    'Are you the pilot? You look very young.',
    'My friend says the left wing is the good one.',
  ],
  cruise: [
    'Are we there yet?',
    'Beautiful view today, Captain.',
    'Who\'s flying the plane right now?',
    'Is it chicken or pasta?',
    'First time flying. It\'s better than I expected!',
    'Can I see the cockpit?',
    'The Wi-Fi is not working.',
    'Can you ask the person in front of me to put their seat up?',
  ],
  athens: [
    'Is that Greece down there?',
    'Do you know a good taverna near the Acropolis?',
    'I can\'t wait for a real souvlaki.',
    'How long until Athens?',
  ],
  landed: [
    'Now that was a landing!',
    'We clap because we\'re happy to be alive.',
    'Is it okay to turn my phone on now?',
    'Thank you, Captain. I\'ll fly with you again.',
    'Everyone\'s standing up already. Why does everyone do that?',
  ],
  hardLanding: [
    'My spine and I would like a word.',
    'Was that a landing, or did we get shot down?',
    'I think my teeth moved.',
    'Well, we\'re down. I\'ll give you that.',
  ],
};

/** Which set of lines fits this moment. */
export function chatterTopic(g, moodName) {
  if (g.result && g.record && g.record.sinkFpm >= 500) return 'hardLanding';
  if (g.result && !g.result.failure && !g.result.missed) return 'landed';
  if (g.emergency && g.emergency.won) return 'afterFight';
  if (moodName === 'scared') return 'scared';
  if (moodName === 'nervous') return 'nervous';
  const c = g.s.contact;
  if (c.mainL || c.mainR || c.nose) return 'parked';
  if (g.airport.id === 'ath') return 'athens';
  return 'cruise';
}

/**
 * The next line from one passenger. talks counts how many times you've spoken
 * to anyone, so it moves on; seat gives each person their own starting point.
 */
export function chatterLine(topic, seat, talks) {
  const lines = LINES[topic];
  const start = Math.floor(seat.phase * 997);
  return lines[(start + talks) % lines.length];
}

export const topics = Object.keys(LINES);

const TALK_REACH = 1.7; // metres

/** The nearest passenger within reach of the walker, or null. */
export function nearestPassenger(w) {
  let best = null;
  let bestDistance = TALK_REACH;
  w.l.seats.filter((s) => s.taken).forEach((seat, index) => {
    const d = Math.hypot(seat.x - w.x, seat.z - w.z);
    if (d < bestDistance) {
      bestDistance = d;
      best = { seat, index };
    }
  });
  return best;
}

/** Seat name like 14C, for the speech bubble. */
export function seatName(l, seat) {
  const letter = 'ABCDEFGHJK'[l.seatZ.indexOf(seat.z)];
  return `${seat.row + 1}${letter}`;
}
