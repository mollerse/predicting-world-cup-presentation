import poisson from "../demos/poisson.js";
import kamp from "../demos/kamp.js";
import styrketall from "../demos/styrketall.js";
import gruppespill from "../demos/gruppespill.ts";
import utfall from "../demos/utfall.js";
import { controls } from "./controls.js";

/** @type {Record.<import("../types.d.ts").AvailableDemo, import("../types.d.ts").CanvasDemo>} */
const availableDemos = { poisson, kamp, styrketall, gruppespill, utfall };

export class CanvasSlide extends HTMLElement {
  /** @type {import("../types.d.ts").CanvasDemo?} */
  #demo = null;
  /** @type {HTMLCanvasElement?} */
  #canvas = null;

  constructor() {
    super();
  }

  connectedCallback() {
    let demoType = /** @type {import("../types.d.ts").AvailableDemo} */ (this.dataset.demo);
    this.#demo = availableDemos[demoType];

    this.#canvas = document.createElement("canvas");
    this.appendChild(this.#canvas);

    let width = 1600;

    this.#canvas.height = (9 / 16) * width;
    this.#canvas.width = width;
  }

  async start() {
    if (this.#demo == null) return;
    if (this.#canvas == null) return;

    await this.#demo.start(this.#canvas, controls, null, this);
  }

  stop() {
    if (this.#demo == null) return;

    this.#demo.stop();
  }
}
