// Every airplane in the game.

import { b737 } from './b737.js';
import { a320 } from './a320.js';
import { b747 } from './b747.js';
import { f35 } from './f35.js';

export const AIRCRAFT = [b737, a320, b747, f35];

export const findAircraft = (id) => AIRCRAFT.find((a) => a.id === id) ?? b737;
