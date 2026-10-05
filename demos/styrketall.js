import {
  GLOBAL_BUTTONS,
  KNOBS,
  MESSAGES,
  VALUES,
} from "@mollerse/midi-control/devices/nanokontrol.js";

/** @import {MidiControl} from '@mollerse/midi-control' */
/** @import {StartFn, StopFn} from '../types.d.ts' */

const SNITT_MÅL_PER_LAG = 1.25;
const NAME = "Styrketall";
const MAX_K = 10;
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

function matchParameters() {
  // MIDI-knottene kan gi desimaltall selv med step: 1.
  const styrketallA = Math.max(0, Math.min(100, Math.round(c.getNumberValue("Styrketall A"))));
  const styrketallB = Math.max(0, Math.min(100, Math.round(c.getNumberValue("Styrketall B"))));
  // Et styrketall på 0 er tillatt, men nevneren må være minst 1.
  const lambdaA = SNITT_MÅL_PER_LAG * (styrketallA / Math.max(1, styrketallB));
  const lambdaB = SNITT_MÅL_PER_LAG * (styrketallB / Math.max(1, styrketallA));
  return { styrketallA, styrketallB, lambdaA, lambdaB };
}

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

  const { lambdaA, lambdaB } = matchParameters();
  målA = poissonSample(lambdaA);
  målB = poissonSample(lambdaB);
  draw();
}

function draw() {
  if (!canvas) return;

  const { styrketallA, styrketallB, lambdaA, lambdaB } = matchParameters();
  const probabilitiesA = poissonProbabilities(lambdaA);
  const probabilitiesB = poissonProbabilities(lambdaB);
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

  drawDistribution(
    `A vs B (styrketall: ${styrketallA})`,
    lambdaA,
    probabilitiesA,
    målA,
    160,
    accent,
  );
  drawDistribution(
    `B vs A (styrketall: ${styrketallB})`,
    lambdaB,
    probabilitiesB,
    målB,
    1120,
    colorB,
  );

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
    c.addNumberValue(
      "Styrketall A",
      { initial: 75, min: 0, max: 100, step: 1 },
      { keyId: KNOBS[1], messageType: MESSAGES.knob, onChange: draw },
    );
    c.addNumberValue(
      "Styrketall B",
      { initial: 60, min: 0, max: 100, step: 1 },
      { keyId: KNOBS[2], messageType: MESSAGES.knob, onChange: draw },
    );
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
