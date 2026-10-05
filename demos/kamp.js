import { GLOBAL_BUTTONS, MESSAGES, VALUES } from "@mollerse/midi-control/devices/nanokontrol.js";

/** @import {MidiControl} from '@mollerse/midi-control' */
/** @import {StartFn, StopFn} from '../types.d.ts' */

// Rediger styrketallene her (1–100).
const STYRKETALL_A = 75;
const STYRKETALL_B = 60;
const SNITT_MÅL_PER_LAG = 1.25;
const NAME = "Kamp";
const MAX_K = 10;
const LAMBDA_A = SNITT_MÅL_PER_LAG * (STYRKETALL_A / STYRKETALL_B);
const LAMBDA_B = SNITT_MÅL_PER_LAG * (STYRKETALL_B / STYRKETALL_A);
const percent = new Intl.NumberFormat("nb-NO", { style: "percent", maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** @type {HTMLCanvasElement | null} */
let canvas = null;
/** @type {MidiControl} */
let c;
let målA = 0;
let målB = 0;

function poissonProbabilities(lambda) {
  const probabilities = [Math.exp(-lambda)];
  for (let k = 1; k < MAX_K; k++) {
    probabilities.push((probabilities[k - 1] * lambda) / k);
  }
  // Siste søyle samler P(X >= 10), slik at grafen viser hele fordelingen.
  probabilities.push(
    Math.max(0, 1 - probabilities.reduce((sum, probability) => sum + probability, 0)),
  );
  return probabilities;
}

const probabilitiesA = poissonProbabilities(LAMBDA_A);
const probabilitiesB = poissonProbabilities(LAMBDA_B);

// Knuths algoritme, som i kampmodellens poissonSample.
function poissonSample(lambda) {
  const limit = Math.exp(-lambda);
  let k = 0;
  let product = 1;
  do {
    k++;
    product *= Math.random();
  } while (product > limit);
  return k - 1;
}

function trekk() {
  if (!canvas) return;

  målA = poissonSample(LAMBDA_A);
  målB = poissonSample(LAMBDA_B);
  draw();
}

function draw() {
  if (!canvas) return;

  const context = canvas.getContext("2d");
  const styles = getComputedStyle(document.documentElement);
  const background = styles.getPropertyValue("--background-color").trim();
  const foreground = styles.getPropertyValue("--main-color").trim();
  const accent = styles.getPropertyValue("--accent-color").trim();
  const font = styles.getPropertyValue("--main-font").trim();
  const colorB = "#70cfff";

  context.save();
  context.setTransform(canvas.width / 1920, 0, 0, canvas.height / 1080, 0, 0);
  context.fillStyle = background;
  context.fillRect(0, 0, 1920, 1080);
  context.textAlign = "center";
  context.textBaseline = "middle";

  function drawDistribution(team, lambda, probabilities, goals, left, color) {
    const width = 720;
    const height = 420;
    const bottom = 650;
    const slotWidth = width / probabilities.length;
    const barWidth = slotWidth * 0.7;
    const selected = Math.min(goals, MAX_K);

    context.textAlign = "center";
    context.fillStyle = color;
    context.font = `300 56px ${font}`;
    context.fillText(team, left + width / 2, 95);
    context.font = `300 32px ${font}`;
    context.fillText(`Forventede mål: λ = ${decimal.format(lambda)}`, left + width / 2, 160);

    // Samme faste 0–100 %-akse for begge lagene.
    context.font = `300 24px ${font}`;
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
      context.fillText(percent.format(probability), left - 16, y);
    }

    context.textAlign = "center";
    for (const [k, probability] of probabilities.entries()) {
      const x = left + (k + 0.5) * slotWidth;
      const barHeight = probability * height;
      context.globalAlpha = k === selected ? 1 : 0.45;
      context.fillStyle = color;
      context.fillRect(x - barWidth / 2, bottom - barHeight, barWidth, barHeight);
      context.globalAlpha = 1;
      if (k === selected) {
        context.strokeStyle = foreground;
        context.lineWidth = 3;
        context.strokeRect(x - barWidth / 2, bottom - barHeight, barWidth, barHeight);
        context.fillRect(x - barWidth / 2, bottom + 20, barWidth, 40);
      }
      context.font = `300 20px ${font}`;
      context.fillStyle = foreground;
      context.fillText(percent.format(probability), x, bottom - barHeight - 20);
      context.font = `300 28px ${font}`;
      context.fillStyle = k === selected ? background : foreground;
      context.fillText(k === MAX_K ? `${k}+` : `${k}`, x, bottom + 40);
    }

    context.fillStyle = foreground;
    context.font = `300 28px ${font}`;
    context.fillText("Antall mål", left + width / 2, bottom + 100);
  }

  drawDistribution("A vs B", LAMBDA_A, probabilitiesA, målA, 160, accent);
  drawDistribution("B vs A", LAMBDA_B, probabilitiesB, målB, 1120, colorB);

  context.fillStyle = foreground;
  context.font = `300 80px ${font}`;
  context.fillText(`${målA} – ${målB}`, 960, 945);
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
    c.addEffect(
      "Nytt trekk",
      { initial: trekk },
      { keyId: GLOBAL_BUTTONS.play, messageType: MESSAGES.button, value: VALUES.button.down },
    );
  }

  trekk();
}

/** @type {StopFn} */
function stop() {
  if (!canvas) return;

  canvas = null;
  c.deactivateBinding(NAME);
}

export default { start, stop };
