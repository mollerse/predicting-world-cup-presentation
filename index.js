import Reveal from "reveal.js";
import RevealHighlight from "reveal.js/plugin/highlight";
import { CanvasSlide } from "./lib/canvas-slide.js";
import { init as initControls } from "./lib/controls.js";

customElements.define("canvas-slide", CanvasSlide);

let deck = new Reveal({
  controls: false,
  progress: false,
  slideNumber: false,
  hash: true,
  history: true,
  disableLayout: true,
  display: "flex",
  transition: "none",
  plugins: [RevealHighlight],
});

deck.on("slidechanged", ({ previousSlide, currentSlide }) => {
  previousSlide?.querySelector("canvas-slide")?.stop();
  document.body.classList.toggle("demo", currentSlide.classList.contains("demo"));
  currentSlide.querySelector("canvas-slide")?.start();
});

// Set a scale based on available width
function scale() {
  let baseWidth = 1920;

  let { width } = document.body.getBoundingClientRect();

  let scale = width / baseWidth;

  document.documentElement.style.setProperty("--scale", `${scale}`);
}

scale();
window.addEventListener("resize", scale);

await initControls();
await deck.initialize();

const currentSlide = deck.getCurrentSlide();
document.body.classList.toggle("demo", currentSlide.classList.contains("demo"));
currentSlide.querySelector("canvas-slide")?.start();
