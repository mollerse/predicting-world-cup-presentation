import {
  GLOBAL_BUTTONS,
  KNOBS,
  MESSAGES,
  VALUES,
} from "@mollerse/midi-control/devices/nanokontrol.js";

/** @import {MidiControl} from '@mollerse/midi-control' */
/** @import {StartFn, StopFn} from '../types.d.ts' */

const NAME = "Utfall";
const SIMULATIONS_INITIAL = 10;
const SIMULATIONS_MIN = 10;
const SIMULATIONS_MAX = 50_000;
const MATCHES = 15;
const SELECTED_MATCH = 6;
const OUTCOMES = [
  { label: "Tap", color: "#ef5350", count: 25 },
  { label: "Uavgjort", color: "#ffd166", count: 36 },
  { label: "Seier", color: "#8be0a4", count: 39 },
];
const percent = new Intl.NumberFormat("nb-NO", { style: "percent", maximumFractionDigits: 1 });

/** @type {HTMLCanvasElement | null} */
let canvas = null;
/** @type {MidiControl} */
let c;
/** @type {number[]} */
let outcomes = [];

function generateOutcomes() {
  // An exact 25/36/39 mix, shuffled once. Knob changes only reveal or hide rows.
  outcomes = OUTCOMES.flatMap((outcome, index) =>
    Array((outcome.count / 100) * SIMULATIONS_MAX).fill(index),
  );
  for (let i = outcomes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [outcomes[i], outcomes[j]] = [outcomes[j], outcomes[i]];
  }
}

function redrawOutcomes() {
  if (!canvas) return;
  generateOutcomes();
  draw();
}

function draw() {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  // MIDI knobs can provide fractional values even with step: 1.
  const simulations = Math.max(
    SIMULATIONS_MIN,
    Math.min(SIMULATIONS_MAX, Math.round(c.getNumberValue("Simuleringer"))),
  );
  const visibleOutcomes = outcomes.slice(0, simulations);
  const counts = OUTCOMES.map((_, index) =>
    visibleOutcomes.reduce((count, outcome) => count + (outcome === index ? 1 : 0), 0),
  );
  const styles = getComputedStyle(document.documentElement);
  const background = styles.getPropertyValue("--background-color").trim();
  const foreground = styles.getPropertyValue("--main-color").trim();
  const font = styles.getPropertyValue("--main-font").trim();

  context.save();
  context.setTransform(canvas.width / 1920, 0, 0, canvas.height / 1080, 0, 0);
  context.fillStyle = background;
  context.fillRect(0, 0, 1920, 1080);
  context.textBaseline = "middle";
  const top = 40;
  const left = 40;
  const cellWidth = 1220 / MATCHES;
  const cellHeight = 1000 / simulations;

  for (const [row, outcome] of visibleOutcomes.entries()) {
    for (let match = 0; match < MATCHES; match++) {
      context.fillStyle = match === SELECTED_MATCH - 1 ? OUTCOMES[outcome].color : "#454545";
      context.fillRect(left + match * cellWidth, top + row * cellHeight, cellWidth, cellHeight);
    }
  }

  context.textAlign = "left";
  context.fillStyle = foreground;
  context.font = `300 48px ${font}`;
  context.fillText(`${simulations} simuleringer`, 1330, 200);
  context.font = `300 28px ${font}`;
  context.fillText(`Utfall av kamp ${SELECTED_MATCH}`, 1330, 270);
  for (const [index, outcome] of OUTCOMES.entries()) {
    const y = 400 + index * 180;
    context.fillStyle = outcome.color;
    context.fillRect(1330, y - 18, 36, 36);
    context.font = `300 36px ${font}`;
    context.fillText(outcome.label, 1390, y);
    context.font = `300 64px ${font}`;
    context.fillText(percent.format(counts[index] / simulations), 1390, y + 70);
  }
  context.restore();
}

/** @type {StartFn} */
function start(targetCanvas, controls) {
  canvas = targetCanvas;
  c = controls;
  if (outcomes.length === 0) generateOutcomes();

  try {
    c.activateBinding(NAME);
  } catch {
    c.createBinding(NAME);
    c.addNumberValue(
      "Simuleringer",
      { initial: SIMULATIONS_INITIAL, min: SIMULATIONS_MIN, max: SIMULATIONS_MAX, step: 1 },
      { keyId: KNOBS[1], messageType: MESSAGES.knob, onChange: draw },
    );
    c.addEffect(
      "Nye utfall",
      { initial: redrawOutcomes },
      { keyId: GLOBAL_BUTTONS.play, messageType: MESSAGES.button, value: VALUES.button.down },
    );
  }
  draw();
}

/** @type {StopFn} */
function stop() {
  if (!canvas) return;
  canvas = null;
  c.deactivateBinding(NAME);
}

export default { start, stop };
