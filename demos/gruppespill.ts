import { GLOBAL_BUTTONS, MESSAGES, VALUES } from "@mollerse/midi-control/devices/nanokontrol.js";
import type { MidiControl } from "@mollerse/midi-control";
import type { StartFn, StopFn } from "../types.d.ts";

// Rediger styrketallene her (1–100). Brukes også som ranking ved ellers lik tabell.
const STYRKETALL = { A: 75, B: 60, C: 50, D: 40 };
const SNITT_MÅL_PER_LAG = 1.25;
const NAME = "Gruppespill";
const MAX_K = 10;
type Lag = keyof typeof STYRKETALL;
type Kamp = {
  hjemme: Lag;
  borte: Lag;
  hjemmeMål: number;
  borteMål: number;
};
type Tabellrad = {
  lag: Lag;
  kampSpilt: number;
  seier: number;
  uavgjort: number;
  tap: number;
  poeng: number;
  målScoret: number;
  målImot: number;
  målforskjell: number;
};

const LAG = Object.keys(STYRKETALL) as Lag[];
const FARGER = { A: "hotpink", B: "#70cfff", C: "#ffd166", D: "#8be0a4" };
const KAMPOPPSETT = LAG.flatMap((hjemme, i) =>
  LAG.slice(i + 1).map((borte) => {
    const lambdaHjemme = SNITT_MÅL_PER_LAG * (STYRKETALL[hjemme] / STYRKETALL[borte]);
    const lambdaBorte = SNITT_MÅL_PER_LAG * (STYRKETALL[borte] / STYRKETALL[hjemme]);
    return {
      hjemme,
      borte,
      lambdaHjemme,
      lambdaBorte,
      probabilitiesHjemme: poissonProbabilities(lambdaHjemme),
      probabilitiesBorte: poissonProbabilities(lambdaBorte),
    };
  }),
);
const percent = new Intl.NumberFormat("nb-NO", { style: "percent", maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("nb-NO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

let canvas: HTMLCanvasElement | null = null;
let c: MidiControl;
let kamper: Kamp[] = [];

function poissonProbabilities(lambda: number): number[] {
  const probabilities = [Math.exp(-lambda)];
  for (let k = 1; k < MAX_K; k++) {
    probabilities.push((probabilities[k - 1] * lambda) / k);
  }
  // Siste søyle samler P(X >= 10), som i kampdemoen.
  probabilities.push(
    Math.max(0, 1 - probabilities.reduce((sum, probability) => sum + probability, 0)),
  );
  return probabilities;
}

function poissonSample(lambda: number): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let product = 1;
  do {
    k++;
    product *= Math.random();
  } while (product > limit);
  return k - 1;
}

function tabellrader(lag: Lag[], resultater: Kamp[]): Tabellrad[] {
  const rader = new Map<Lag, Tabellrad>(
    lag.map((navn) => [
      navn,
      {
        lag: navn,
        kampSpilt: 0,
        seier: 0,
        uavgjort: 0,
        tap: 0,
        poeng: 0,
        målScoret: 0,
        målImot: 0,
        målforskjell: 0,
      },
    ]),
  );

  for (const kamp of resultater) {
    if (!rader.has(kamp.hjemme) || !rader.has(kamp.borte)) continue;
    for (const [navn, mål, imot] of [
      [kamp.hjemme, kamp.hjemmeMål, kamp.borteMål],
      [kamp.borte, kamp.borteMål, kamp.hjemmeMål],
    ] as const) {
      const rad = rader.get(navn)!;
      rad.kampSpilt++;
      rad.seier += mål > imot ? 1 : 0;
      rad.uavgjort += mål === imot ? 1 : 0;
      rad.tap += mål < imot ? 1 : 0;
      rad.poeng += mål > imot ? 3 : mål === imot ? 1 : 0;
      rad.målScoret += mål;
      rad.målImot += imot;
      rad.målforskjell += mål - imot;
    }
  }
  return [...rader.values()];
}

// Grupper sammenhengende rader med like kriterier etter sortering.
function grupperLike(rader: Tabellrad[], like: (a: Tabellrad, b: Tabellrad) => boolean) {
  const grupper: Tabellrad[][] = [];
  for (const rad of rader) {
    const siste = grupper[grupper.length - 1];
    if (siste && like(siste[0], rad)) siste.push(rad);
    else grupper.push([rad]);
  }
  return grupper;
}

function sorterInnbyrdes(likeLag: Tabellrad[], resultater: Kamp[]): Tabellrad[][] {
  if (likeLag.length <= 1) return [likeLag];
  const innbyrdes = new Map(
    tabellrader(
      likeLag.map((rad) => rad.lag),
      resultater,
    ).map((rad) => [rad.lag, rad]),
  );
  const sammenlign = (a: Tabellrad, b: Tabellrad) => {
    const x = innbyrdes.get(a.lag)!;
    const y = innbyrdes.get(b.lag)!;
    return y.poeng - x.poeng || y.målforskjell - x.målforskjell || y.målScoret - x.målScoret;
  };
  const grupper = grupperLike([...likeLag].sort(sammenlign), (a, b) => sammenlign(a, b) === 0);
  if (grupper.length === 1) return [likeLag];
  return grupper.flatMap((gruppe) => sorterInnbyrdes(gruppe, resultater));
}

// Samme kriterierekkefølge som referansens gruppetabell. Fair play er likt for alle
// demolag; høyere styrketall gir bedre ranking som siste sportslige kriterium.
export function gruppetabell(resultater: Kamp[]): Tabellrad[] {
  const rader = tabellrader(LAG, resultater).sort((a, b) => b.poeng - a.poeng);
  return grupperLike(rader, (a, b) => a.poeng === b.poeng).flatMap((gruppe) =>
    sorterInnbyrdes(gruppe, resultater).flatMap((likeLag) =>
      [...likeLag].sort(
        (a, b) =>
          b.målforskjell - a.målforskjell ||
          b.målScoret - a.målScoret ||
          STYRKETALL[b.lag] - STYRKETALL[a.lag] ||
          a.lag.localeCompare(b.lag),
      ),
    ),
  );
}

function trekk() {
  if (!canvas) return;
  kamper = KAMPOPPSETT.map((kamp) => ({
    hjemme: kamp.hjemme,
    borte: kamp.borte,
    hjemmeMål: poissonSample(kamp.lambdaHjemme),
    borteMål: poissonSample(kamp.lambdaBorte),
  }));
  draw();
}

function draw() {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const styles = getComputedStyle(document.documentElement);
  const background = styles.getPropertyValue("--background-color").trim();
  const foreground = styles.getPropertyValue("--main-color").trim();
  const font = styles.getPropertyValue("--main-font").trim();

  context.save();
  context.setTransform(canvas.width / 1920, 0, 0, canvas.height / 1080, 0, 0);
  context.fillStyle = background;
  context.fillRect(0, 0, 1920, 1080);
  context.textBaseline = "middle";

  function drawDistribution(
    lag: Lag,
    motstander: Lag,
    lambda: number,
    probabilities: number[],
    mål: number,
    left: number,
    top: number,
  ) {
    const ctx = context!;
    const width = 230;
    const height = 170;
    const bottom = top + 245;
    const slotWidth = width / probabilities.length;
    const barWidth = slotWidth * 0.7;
    const selected = Math.min(mål, MAX_K);
    ctx.textAlign = "center";
    ctx.fillStyle = FARGER[lag];
    ctx.font = `300 28px ${font}`;
    ctx.fillText(`${lag} vs ${motstander}`, left + width / 2, top + 20);
    ctx.font = `300 20px ${font}`;
    ctx.fillText(`λ = ${decimal.format(lambda)}`, left + width / 2, top + 53);

    // Felles, fast 0–100 %-akse for alle tolv fordelingene.
    ctx.font = `300 16px ${font}`;
    for (let tick = 0; tick <= 2; tick++) {
      const probability = tick / 2;
      const y = bottom - probability * height;
      ctx.strokeStyle = tick === 0 ? foreground : "#333333";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillStyle = foreground;
      ctx.fillText(percent.format(probability), left - 8, y);
    }
    ctx.textAlign = "center";
    for (const [k, probability] of probabilities.entries()) {
      const x = left + (k + 0.5) * slotWidth;
      const barHeight = probability * height;
      ctx.fillStyle = FARGER[lag];
      ctx.globalAlpha = k === selected ? 1 : 0.45;
      ctx.fillRect(x - barWidth / 2, bottom - barHeight, barWidth, barHeight);
      ctx.globalAlpha = 1;
      if (k === selected) {
        ctx.strokeStyle = foreground;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - barWidth / 2, bottom - barHeight, barWidth, barHeight);
        ctx.fillRect(x - slotWidth / 2, bottom + 8, slotWidth, 24);
      }
      ctx.fillStyle = k === selected ? background : foreground;
      ctx.fillText(k === MAX_K ? `${k}+` : `${k}`, x, bottom + 20);
    }
  }

  for (const [i, kamp] of kamper.entries()) {
    const oppsett = KAMPOPPSETT[i];
    const left = 65 + (i % 2) * 610;
    const top = 20 + Math.floor(i / 2) * 350;
    drawDistribution(
      kamp.hjemme,
      kamp.borte,
      oppsett.lambdaHjemme,
      oppsett.probabilitiesHjemme,
      kamp.hjemmeMål,
      left,
      top,
    );
    drawDistribution(
      kamp.borte,
      kamp.hjemme,
      oppsett.lambdaBorte,
      oppsett.probabilitiesBorte,
      kamp.borteMål,
      left + 290,
      top,
    );
    context.fillStyle = foreground;
    context.textAlign = "center";
    context.font = `300 32px ${font}`;
    context.fillText(
      `${kamp.hjemme}  ${kamp.hjemmeMål} – ${kamp.borteMål}  ${kamp.borte}`,
      left + 260,
      top + 310,
    );
  }

  const left = 1290;
  context.textAlign = "center";
  context.fillStyle = foreground;
  context.font = `300 40px ${font}`;
  context.fillText("GRUPPETABELL", 1590, 310);
  const columns = [
    { title: "Lag", x: left + 25 },
    { title: "K", x: left + 110 },
    { title: "V", x: left + 165 },
    { title: "U", x: left + 220 },
    { title: "T", x: left + 275 },
    { title: "Mål", x: left + 360 },
    { title: "+/−", x: left + 460 },
    { title: "P", x: left + 550 },
  ];
  context.font = `300 24px ${font}`;
  for (const column of columns) context.fillText(column.title, column.x, 390);
  for (const [i, rad] of gruppetabell(kamper).entries()) {
    const y = 470 + i * 85;
    context.strokeStyle = "#333333";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(left - 10, y + 42);
    context.lineTo(1875, y + 42);
    context.stroke();
    const values = [
      rad.lag,
      rad.kampSpilt,
      rad.seier,
      rad.uavgjort,
      rad.tap,
      `${rad.målScoret}–${rad.målImot}`,
      rad.målforskjell > 0 ? `+${rad.målforskjell}` : rad.målforskjell,
      rad.poeng,
    ];
    for (const [j, value] of values.entries()) {
      context.fillStyle = j === 0 ? FARGER[rad.lag] : foreground;
      context.font = `${j === 7 ? 600 : 300} 28px ${font}`;
      context.fillText(String(value), columns[j].x, y);
    }
  }
  context.restore();
}

const start: StartFn = (targetCanvas, controls) => {
  canvas = targetCanvas;
  c = controls;
  try {
    c.activateBinding(NAME);
  } catch {
    c.createBinding(NAME);
    c.addEffect(
      "Nytt gruppespill",
      { initial: trekk },
      { keyId: GLOBAL_BUTTONS.play, messageType: MESSAGES.button, value: VALUES.button.down },
    );
  }
  trekk();
};

const stop: StopFn = () => {
  if (!canvas) return;
  canvas = null;
  c.deactivateBinding(NAME);
};

export default { start, stop };
