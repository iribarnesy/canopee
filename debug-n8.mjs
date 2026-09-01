import { advanceWeek } from './src/engine/game.ts';
import { createGameState, plantAt } from './src/engine/state.ts';
import { rngStateFromSeed } from './src/engine/rng.ts';
import { serieToWeeks } from './src/engine/meteo.ts';
import { serieMeteoPour } from './src/data/meteo.ts';
import { LANDE_SECHE } from './src/engine/stations.ts';
const station = { ...LANDE_SECHE.station, coteM: 60, voisinage: [] };
const weather = serieToWeeks(serieMeteoPour('lande-seche'));
function run(nurses, dist, espece, years) {
  let state = createGameState(station, rngStateFromSeed(11));
  for (let a = 0; a < nurses; a++) {
    const ang = (2 * Math.PI * a) / Math.max(1, nurses);
    state = plantAt(state, 'ulex_europaeus', 30 + dist * Math.cos(ang), 30 + dist * Math.sin(ang), 2.2);
  }
  state = plantAt(state, espece, 30, 30, 0.3);
  const id = state.nextTreeId - 1;
  for (let i = 0; i < years * 52; i++) state = advanceWeek(state, weather[i % weather.length], []).state;
  const t = state.trees.find(x => x.id === id);
  return t?.alive ? `${t.heightM.toFixed(2)} m` : 'MORT';
}
console.log('distance nurse →      nu       1,4 m    3 m      5 m');
for (const esp of ['castanea_sativa', 'quercus_suber', 'corylus_avellana', 'pinus_sylvestris']) {
  console.log(esp.padEnd(18), '|', run(0,0,esp,15).padEnd(8), run(6,1.4,esp,15).padEnd(8), run(6,3,esp,15).padEnd(8), run(6,5,esp,15));
}
