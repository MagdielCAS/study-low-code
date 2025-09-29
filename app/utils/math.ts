import type { Point } from "~/types/board";

export const euclidianDistance = (a: Point, b: Point) => Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2)