export const drawCircle = (context: CanvasRenderingContext2D) => (x: number, y: number, radius: number, fillStyle: string | CanvasGradient | CanvasPattern) => {
  context.beginPath();
  context.arc(x, y, radius, 0, 2 * Math.PI, false);
  context.fillStyle = fillStyle;
  context.fill();
};
