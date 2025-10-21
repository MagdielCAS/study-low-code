export interface LowCodePoint {
  x: number
  y: number
}

export type LowCodePortDirection = 'input' | 'output'

export interface LowCodePort {
  id: string
  label?: string
  direction: LowCodePortDirection
  /** Position relative to the node's top-left corner */
  position: LowCodePoint
}

export interface LowCodeNode {
  id: string
  label: string
  position: LowCodePoint
  width?: number
  height?: number
  ports: LowCodePort[]
}

export interface LowCodeConnectionTerminal {
  nodeId: string
  portId: string
}

export interface LowCodeConnection {
  id: string
  source: LowCodeConnectionTerminal
  target: LowCodeConnectionTerminal
}
