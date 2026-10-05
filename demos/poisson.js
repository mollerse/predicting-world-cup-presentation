import { KNOBS, MESSAGES } from "@mollerse/midi-control/devices/nanokontrol.js";

/** @import {MidiControl} from '@mollerse/midi-control' */
/** @import {StartFn, StopFn} from '../types.d.ts' */

const NAME = "Poisson";
const MAX_K = 10;
const LAMBDA_INITIAL = 1.5;
const LAMBDA_MIN = 0;
const LAMBDA_MAX = 8;
const LAMBDA_STEP = 0.1;
const percent = new Intl.NumberFormat("nb-NO", { style: "percent", maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** @type {HTMLCanvasElement | null} */
let canvas = null;
/** @type {MidiControl} */
let c;

function draw() {
  if (!canvas) return;

  const lambda = c.getNumberValue("lambda");
  // P(X = 0) = e^-λ; P(X = k) = P(X = k - 1) * λ / k.
  // Equivalent to e^-λ * λ^k / k!, including the degenerate distribution at λ = 0.
  const probabilities = [Math.exp(-lambda)];
  for (let k = 1; k < MAX_K; k++) {
    probabilities.push((probabilities[k - 1] * lambda) / k);
  }
  // The final bucket contains P(X >= 10), so all bars together sum to 100%.
  probabilities.push(
    Math.max(0, 1 - probabilities.reduce((sum, probability) => sum + probability, 0)),
  );

  const context = canvas.getContext("2d");
  const styles = getComputedStyle(document.documentElement);
  const background = styles.getPropertyValue("--background-color").trim();
  const foreground = styles.getPropertyValue("--main-color").trim();
  const accent = styles.getPropertyValue("--accent-color").trim();
  const font = styles.getPropertyValue("--main-font").trim();

  context.save();
  context.setTransform(canvas.width / 1920, 0, 0, canvas.height / 1080, 0, 0);
  context.fillStyle = background;
  context.fillRect(0, 0, 1920, 1080);

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = foreground;
  context.font = `300 72px ${font}`;
  context.fillText("POISSON-FORDELINGEN", 960, 90);
  context.fillStyle = accent;
  context.font = `300 48px ${font}`;
  context.fillText(`λ = ${decimal.format(lambda)}`, 960, 170);

  const left = 180;
  const top = 270;
  const width = 1620;
  const height = 600;
  const bottom = top + height;
  const slotWidth = width / probabilities.length;
  const barWidth = slotWidth * 0.7;

  // Fixed 0–100% axis: changing λ never rescales the probabilities.
  context.font = `300 32px ${font}`;
  for (let tick = 0; tick <= 5; tick++) {
    const probability = tick / 5;
    const y = bottom - probability * height;
    context.strokeStyle = tick === 0 ? foreground : "#333333";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(left + width, y);
    context.stroke();
    context.fillStyle = foreground;
    context.textAlign = "right";
    context.fillText(percent.format(probability), left - 24, y);
  }

  context.textAlign = "center";
  for (const [k, probability] of probabilities.entries()) {
    const x = left + (k + 0.5) * slotWidth;
    const barHeight = probability * height;
    context.fillStyle = accent;
    context.fillRect(x - barWidth / 2, bottom - barHeight, barWidth, barHeight);
    context.fillStyle = foreground;
    context.fillText(percent.format(probability), x, bottom - barHeight - 26);
    context.fillText(k === MAX_K ? `${k}+` : `${k}`, x, bottom + 36);
  }

  context.font = `300 40px ${font}`;
  context.fillText("Sannsynlighet for gitt k", 960, 960);
  context.restore();
}

/** @type {StartFn} */
function start(targetCanvas, controls) {
  canvas = targetCanvas;
  c = controls;

  try {
    c.activateBinding(NAME);
  } catch {
    c.createBinding(NAME);
    c.addNumberValue(
      "lambda",
      { initial: LAMBDA_INITIAL, min: LAMBDA_MIN, max: LAMBDA_MAX, step: LAMBDA_STEP },
      { keyId: KNOBS[1], messageType: MESSAGES.knob, onChange: draw },
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
