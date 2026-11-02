// Where everything is inside the airplane, in the body frame (+x nose, +y up,
// +z right wing). Shared by the 3D cabin, the walking code and the passengers.

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function cabinLayout(ac) {
  const k = ac.model.scale;
  const wide = !!ac.model.hump;
  const deckFloor = ac.eye[1] - 1.4;
  const cabinFloor = deckFloor - 0.6; // a short step down from the flight deck
  const doorX = ac.eye[0] - 2.4;
  const frontRowX = doorX - 2.2;
  const rearX = -13.5 * k;
  const rowPitch = wide ? 0.95 : 0.8;
  const rows = Math.floor((frontRowX - rearX - 1.5) / rowPitch);
  const seatZ = wide
    ? [-2.95, -2.45, -1.95, -0.75, -0.25, 0.25, 0.75, 1.95, 2.45, 2.95]
    : [-1.55, -1.05, -0.55, 0.55, 1.05, 1.55];
  const aisle = wide ? -1.35 : 0;
  const halfWidth = wide ? 3.4 : 1.85;

  const rnd = seeded(4711);
  const seats = [];
  for (let r = 0; r < rows; r++) {
    for (const z of seatZ) {
      seats.push({ row: r, x: frontRowX - r * rowPitch, z, taken: rnd() < 0.86, shade: rnd(), hair: rnd(), phase: rnd() * 6.28 });
    }
  }
  return {
    k, wide, deckFloor, cabinFloor, doorX, frontRowX, rearX, rowPitch, rows,
    seatZ, aisle, halfWidth, seats,
    ceiling: cabinFloor + 2.3,
    passengers: seats.filter((s) => s.taken).length,
  };
}

/** Floor height at a position along the airplane; a short ramp joins the two decks. */
export function floorAt(l, x) {
  const t = Math.min(1, Math.max(0, (x - (l.doorX - 1)) / 1));
  return l.cabinFloor + (l.deckFloor - l.cabinFloor) * t;
}
