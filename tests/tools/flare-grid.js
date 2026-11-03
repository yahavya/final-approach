// Prints a table: a person flies down the path, then holds the pull key from a
// given height for a given time, closing the thrust. Used to tune how forgiving
// the flare is. Run: jsc -m tests/tools/flare-grid.js
import { AIRCRAFT } from '../../src/sim/aircraft/index.js?v=e179301';
import { createGame, tick } from '../../src/game/scenario.js?v=e179301';
import { createBot, flyBot } from '../../src/game/bot.js?v=e179301';
import { createInput } from '../../src/ui/input.js?v=e179301';
import { wheelHeight } from '../../src/sim/gear.js?v=e179301';

function run(ac, startFt, holdS) {
  const h = {};
  const input = createInput({ addEventListener: (t, f) => { h[t] = f; } });
  const preventDefault = () => {};
  const g = createGame(ac, { distance: 3000 });
  const bot = createBot({ noFlare: true });
  let pullAt = null;
  let released = false;
  const frame = 1 / 60;
  for (let f = 0; f < 90 / frame && g.phase === 'approach'; f++) {
    const ft = wheelHeight(g.s, ac) / 0.3048;
    if (ft > startFt) { flyBot(bot, g); } else {
      if (pullAt === null) {
        pullAt = g.time;
        g.controls.elevator = 0;
        h.keydown({ code: 'ArrowDown', preventDefault });
        h.keydown({ code: 'KeyF', preventDefault });
      }
      if (!released && g.time - pullAt >= holdS) { released = true; h.keyup({ code: 'ArrowDown', preventDefault }); }
      input.apply(g, frame);
    }
    tick(g); tick(g);
  }
  return g.record ? Math.round(g.record.sinkFpm) : 'none';
}
const holds = [0.4, 0.7, 1, 1.5, 2, 3, 5];
for (const ac of AIRCRAFT) {
  print(`\n${ac.name}`);
  print('start ft | hold s: ' + holds.join('     '));
  for (const ft of [15, 20, 30, 40, 50, 70, 100]) {
    print(String(ft).padStart(4) + '     | ' + holds.map((s) => String(run(ac, ft, s)).padStart(6)).join(''));
  }
}
