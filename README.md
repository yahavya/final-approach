# Final Approach

Fly a Boeing 737-800, Airbus A320-200 or Boeing 747-400 at Ben Gurion in your browser. Landing mode starts ten kilometers out on the approach to runway 12. Full Flight takes off from runway 30, flies out over the sea, and comes back to land. Athens flies from Tel Aviv to runway 03R at Athens, with the cruise shown as a map.

## Play

**[Play it here](https://yahavya.github.io/final-approach/)**, on a computer with a keyboard.

To run it locally:

    ./play.sh

| Key | Action |
| --- | --- |
| ↓ / ↑ | Pull back / push forward |
| ← / → | Roll |
| Q / E | Rudder, and steering on the ground |
| R / F | Thrust up / down |
| Space | Brakes |
| T | Reverse thrust, on the ground |
| G | Landing gear |
| Z / X | Flaps up / down |
| C | Cockpit / chase view |
| V | Get up and walk the cabin, when parked or above 1,500 ft |
| E | While walking: talk to a passenger, or hold to spray a fire |
| H | Coach on / off |
| A | Change airplane, on the title screen |
| M | Back to the title screen, when paused or finished |
| Enter | Restart |
| Esc | Pause |

The coach shows what to press in real time, and it's on until you turn it off. The keys are always listed along the bottom of the screen.

Every flight gets its own crosswind, gusts and slightly off-center start, so the airplane will not land itself. Add `?calm=1` for still air and a perfect start, to practice the flare alone.

Add `?distance=2000` to the address to start closer, for flare practice, or `?bot=1` to watch the autopilot fly. Add `?mode=full` for Full Flight, `?mode=athens` for Athens, plus `&arrive=1` to skip to the Athens arrival, `?mode=emergency` for Emergency, plus `&hijack=1` or `&fire=1` to start that emergency after a few seconds, or `?aircraft=a320` or `?aircraft=b747` to pick an airplane.

Emergency mode starts in the air on the way back to Ben Gurion, with a cockpit break-in and a cabin fire. Hammer X to fight off the attacker, then run back and hold E to put out the fire.

## Privacy

The live site uses Google Analytics to count players and flights. It can be turned off on the title screen, and the game works the same either way.

## How it works

- `src/sim/` is the flight model: forces, gear and aircraft data, with no graphics.
- `src/game/` is the scenario, scoring and landing bot, also with no graphics.
- `src/world/` and `src/ui/` draw it and read the keyboard. They read simulation state and never change it, except for the pilot's controls.

There is no build step and no dependencies to install. Three.js is in `vendor/`.

## Publishing

Commit to main, then run `python3 tools/release.py`. It stamps every file with the commit's version and publishes to the gh-pages branch, which GitHub Pages serves, so browsers never mix old and new files.

## Tests

    ./tests/run.sh

Or open `/tests/sim-tests.html` while the game is running.

## Accuracy

The runway position, heading and length come from published data. The flight model is tuned to reproduce known 737 behavior, like Vref, deck angle and stall speed. It feels right but isn't certifiable. The city and coast are stylized and only roughly in the right places.
