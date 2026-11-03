// Every airplane in the game.

import { b737 } from './b737.js?v=e179301';
import { a320 } from './a320.js?v=e179301';
import { b747 } from './b747.js?v=e179301';
import { f35 } from './f35.js?v=e179301';

export const AIRCRAFT = [b737, a320, b747, f35];

export const findAircraft = (id) => AIRCRAFT.find((a) => a.id === id) ?? b737;
