<template>
  <canvas
    ref="board"
    class="w-full h-full"
    @mousedown="handleMouseDown"
    @mouseup="handleMouseUp"
    @mousemove="handleMouseMove"
    @mouseleave="handlePointerLeave"
    @wheel.prevent="handleWheel"
    @touchstart.passive="handleTouchStart"
    @touchmove.prevent="handleTouchMove"
    @touchend="handleTouchEnd"
  >
    Your browser does not support canvas.
  </canvas>
</template>

<script lang="ts" setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue'
import type {
  LowCodeConnection,
  LowCodeConnectionTerminal,
  LowCodeNode,
  LowCodePoint,
  LowCodePort,
} from '~/types/lowCode'

const DEFAULT_NODE_WIDTH = 180
const DEFAULT_NODE_HEIGHT = 100
const PORT_RADIUS = 7
const GRID_SIZE = 32
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.5

const props = defineProps<{
  nodes: LowCodeNode[]
  connections: LowCodeConnection[]
}>()

const emit = defineEmits<{
  (e: 'nodeMove', payload: { id: string; position: LowCodePoint }): void
  (e: 'connectionCreate', payload: LowCodeConnection): void
  (e: 'connectionDelete', payload: { id: string }): void
}>()

const board = ref<HTMLCanvasElement | null>(null)
const ctx = ref<CanvasRenderingContext2D | null>(null)

const interactiveNodes = shallowRef<LowCodeNode[]>([])

watch(
  () => props.nodes,
  (nodes) => {
    interactiveNodes.value = nodes.map((node) => ({
      ...node,
      ports: node.ports.map((port) => ({ ...port }))
    }))
  },
  { immediate: true, deep: true }
)

const camera = reactive({
  offset: { x: 0, y: 0 },
  zoom: 1
})

const pointerCanvas = ref<LowCodePoint | null>(null)
const pointerWorld = computed<LowCodePoint | null>(() => {
  if (!pointerCanvas.value) {
    return null
  }
  return toWorld(pointerCanvas.value)
})

const isPanning = ref(false)
const panStart = ref<LowCodePoint | null>(null)
const draggingNode = ref<{
  id: string
  offset: LowCodePoint
} | null>(null)

const pendingConnection = ref<{
  source: LowCodeConnectionTerminal
  start: LowCodePoint
  current: LowCodePoint
} | null>(null)

const hoverPort = ref<{
  node: LowCodeNode
  port: LowCodePort
} | null>(null)

const hoverConnectionId = ref<string | null>(null)

let animationFrameId: number | null = null

const getNodeSize = (node: LowCodeNode) => ({
  width: node.width ?? DEFAULT_NODE_WIDTH,
  height: node.height ?? DEFAULT_NODE_HEIGHT
})

const getCanvasPoint = (event: MouseEvent | Touch) => {
  if (!board.value) {
    return null
  }
  const rect = board.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  return { x, y }
}

const toWorld = (point: LowCodePoint): LowCodePoint => ({
  x: (point.x - camera.offset.x) / camera.zoom,
  y: (point.y - camera.offset.y) / camera.zoom
})

const toCanvas = (point: LowCodePoint): LowCodePoint => ({
  x: point.x * camera.zoom + camera.offset.x,
  y: point.y * camera.zoom + camera.offset.y
})

const nodeContainsPoint = (node: LowCodeNode, point: LowCodePoint) => {
  const size = getNodeSize(node)
  return (
    point.x >= node.position.x &&
    point.x <= node.position.x + size.width &&
    point.y >= node.position.y &&
    point.y <= node.position.y + size.height
  )
}

const getPortWorldPosition = (node: LowCodeNode, port: LowCodePort): LowCodePoint => ({
  x: node.position.x + port.position.x,
  y: node.position.y + port.position.y
})

const portAtPoint = (point: LowCodePoint) => {
  const threshold = PORT_RADIUS / camera.zoom
  for (let i = interactiveNodes.value.length - 1; i >= 0; i -= 1) {
    const node = interactiveNodes.value[i]
    for (const port of node.ports) {
      const portPosition = getPortWorldPosition(node, port)
      const dx = portPosition.x - point.x
      const dy = portPosition.y - point.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance <= threshold) {
        return { node, port }
      }
    }
  }
  return null
}

const nodeAtPoint = (point: LowCodePoint) => {
  for (let i = interactiveNodes.value.length - 1; i >= 0; i -= 1) {
    const node = interactiveNodes.value[i]
    if (nodeContainsPoint(node, point)) {
      return node
    }
  }
  return null
}

const getConnectionPoints = (connection: LowCodeConnection) => {
  const sourceNode = interactiveNodes.value.find((node) => node.id === connection.source.nodeId)
  const targetNode = interactiveNodes.value.find((node) => node.id === connection.target.nodeId)
  if (!sourceNode || !targetNode) {
    return null
  }
  const sourcePort = sourceNode.ports.find((port) => port.id === connection.source.portId)
  const targetPort = targetNode.ports.find((port) => port.id === connection.target.portId)
  if (!sourcePort || !targetPort) {
    return null
  }
  const start = getPortWorldPosition(sourceNode, sourcePort)
  const end = getPortWorldPosition(targetNode, targetPort)
  return { start, end }
}

const distanceToSegment = (point: LowCodePoint, start: LowCodePoint, end: LowCodePoint) => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) {
    const distX = point.x - start.x
    const distY = point.y - start.y
    return Math.sqrt(distX * distX + distY * distY)
  }
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)
  const clampedT = Math.max(0, Math.min(1, t))
  const projX = start.x + clampedT * dx
  const projY = start.y + clampedT * dy
  const diffX = point.x - projX
  const diffY = point.y - projY
  return Math.sqrt(diffX * diffX + diffY * diffY)
}

const updateHoverConnection = (point: LowCodePoint | null) => {
  if (!point) {
    hoverConnectionId.value = null
    return
  }
  const threshold = 10 / camera.zoom
  for (const connection of props.connections) {
    const points = getConnectionPoints(connection)
    if (!points) {
      continue
    }
    const distance = distanceToSegment(point, points.start, points.end)
    if (distance <= threshold) {
      hoverConnectionId.value = connection.id
      return
    }
  }
  hoverConnectionId.value = null
}

const startPanning = () => {
  isPanning.value = true
  panStart.value = pointerCanvas.value ? { ...pointerCanvas.value } : null
}

const stopPanning = () => {
  isPanning.value = false
  panStart.value = null
}

const handleNodeMove = (nodeId: string, position: LowCodePoint) => {
  interactiveNodes.value = interactiveNodes.value.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          position: { x: position.x, y: position.y }
        }
      : node
  )
  emit('nodeMove', { id: nodeId, position: { x: position.x, y: position.y } })
}

// biome-ignore lint/correctness/noUnusedVariables: used in the template bindings
const handleMouseDown = (event: MouseEvent) => {
  if (!board.value) {
    return
  }
  board.value.focus?.()
  const canvasPoint = getCanvasPoint(event)
  if (!canvasPoint) {
    return
  }
  pointerCanvas.value = canvasPoint
  const worldPoint = toWorld(canvasPoint)

  if (event.altKey && hoverConnectionId.value) {
    emit('connectionDelete', { id: hoverConnectionId.value })
    return
  }

  const portMatch = portAtPoint(worldPoint)
  if (portMatch) {
    const portPosition = getPortWorldPosition(portMatch.node, portMatch.port)
    pendingConnection.value = {
      source: { nodeId: portMatch.node.id, portId: portMatch.port.id },
      start: portPosition,
      current: portPosition
    }
    return
  }

  const node = nodeAtPoint(worldPoint)
  if (node) {
    draggingNode.value = {
      id: node.id,
      offset: {
        x: worldPoint.x - node.position.x,
        y: worldPoint.y - node.position.y
      }
    }
    return
  }

  startPanning()
}

const handleMouseMove = (event: MouseEvent) => {
  const canvasPoint = getCanvasPoint(event)
  if (!canvasPoint) {
    return
  }
  pointerCanvas.value = canvasPoint
  const worldPoint = pointerWorld.value

  updateHoverConnection(worldPoint)
  hoverPort.value = worldPoint ? portAtPoint(worldPoint) : null

  if (isPanning.value && panStart.value) {
    const dx = canvasPoint.x - panStart.value.x
    const dy = canvasPoint.y - panStart.value.y
    camera.offset.x += dx
    camera.offset.y += dy
    panStart.value = { ...canvasPoint }
    return
  }

  if (draggingNode.value && worldPoint) {
    const newPosition = {
      x: worldPoint.x - draggingNode.value.offset.x,
      y: worldPoint.y - draggingNode.value.offset.y
    }
    handleNodeMove(draggingNode.value.id, newPosition)
    return
  }

  if (pendingConnection.value && worldPoint) {
    pendingConnection.value = {
      ...pendingConnection.value,
      current: { ...worldPoint }
    }
  }
}

const handleMouseUp = () => {
  if (draggingNode.value) {
    draggingNode.value = null
  }

  if (pendingConnection.value) {
    if (hoverPort.value) {
      const { node: targetNode, port: targetPort } = hoverPort.value
      const source = pendingConnection.value.source
      if (!(source.nodeId === targetNode.id && source.portId === targetPort.id)) {
        const connectionId = `${source.nodeId}:${source.portId}->${targetNode.id}:${targetPort.id}:${Date.now()}`
        emit('connectionCreate', {
          id: connectionId,
          source: { ...source },
          target: { nodeId: targetNode.id, portId: targetPort.id }
        })
      }
    }
    pendingConnection.value = null
  }

  stopPanning()
}

// biome-ignore lint/correctness/noUnusedVariables: used in the template bindings
const handlePointerLeave = () => {
  stopPanning()
  draggingNode.value = null
  pendingConnection.value = null
  hoverPort.value = null
  hoverConnectionId.value = null
}

const updateZoom = (amount: number, center: LowCodePoint) => {
  const previousZoom = camera.zoom
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, previousZoom + amount))
  if (nextZoom === previousZoom) {
    return
  }
  const worldPosBefore = toWorld(center)
  camera.zoom = nextZoom
  const canvasAfter = toCanvas(worldPosBefore)
  camera.offset.x += center.x - canvasAfter.x
  camera.offset.y += center.y - canvasAfter.y
}

// biome-ignore lint/correctness/noUnusedVariables: used in the template bindings
const handleWheel = (event: WheelEvent) => {
  const canvasPoint = getCanvasPoint(event)
  if (!canvasPoint) {
    return
  }
  const zoomDelta = -event.deltaY * 0.0015
  updateZoom(zoomDelta, canvasPoint)
}

const getTouch = (event: TouchEvent) => {
  if (event.touches.length === 0) {
    return null
  }
  return event.touches[0]
}

// biome-ignore lint/correctness/noUnusedVariables: used in the template bindings
const handleTouchStart = (event: TouchEvent) => {
  const touch = getTouch(event)
  if (!touch) {
    return
  }
  const canvasPoint = getCanvasPoint(touch)
  if (!canvasPoint) {
    return
  }
  pointerCanvas.value = canvasPoint
  const worldPoint = pointerWorld.value
  if (!worldPoint) {
    startPanning()
    return
  }
  const portMatch = portAtPoint(worldPoint)
  if (portMatch) {
    const portPosition = getPortWorldPosition(portMatch.node, portMatch.port)
    pendingConnection.value = {
      source: { nodeId: portMatch.node.id, portId: portMatch.port.id },
      start: portPosition,
      current: portPosition
    }
    return
  }
  const node = nodeAtPoint(worldPoint)
  if (node) {
    draggingNode.value = {
      id: node.id,
      offset: {
        x: worldPoint.x - node.position.x,
        y: worldPoint.y - node.position.y
      }
    }
    return
  }
  startPanning()
}

// biome-ignore lint/correctness/noUnusedVariables: used in the template bindings
const handleTouchMove = (event: TouchEvent) => {
  const touch = getTouch(event)
  if (!touch) {
    return
  }
  handleMouseMove(touch as unknown as MouseEvent)
}

// biome-ignore lint/correctness/noUnusedVariables: used in the template bindings
const handleTouchEnd = () => {
  handleMouseUp()
}

const drawGrid = (context: CanvasRenderingContext2D, width: number, height: number) => {
  const startX = -camera.offset.x / camera.zoom
  const startY = -camera.offset.y / camera.zoom
  const scaledWidth = width / camera.zoom
  const scaledHeight = height / camera.zoom
  const firstVertical = Math.floor(startX / GRID_SIZE) * GRID_SIZE
  const firstHorizontal = Math.floor(startY / GRID_SIZE) * GRID_SIZE

  context.save()
  context.strokeStyle = '#e2e8f0'
  context.lineWidth = 1 / camera.zoom

  for (let x = firstVertical; x < startX + scaledWidth; x += GRID_SIZE) {
    context.beginPath()
    context.moveTo(x, startY)
    context.lineTo(x, startY + scaledHeight)
    context.stroke()
  }

  for (let y = firstHorizontal; y < startY + scaledHeight; y += GRID_SIZE) {
    context.beginPath()
    context.moveTo(startX, y)
    context.lineTo(startX + scaledWidth, y)
    context.stroke()
  }
  context.restore()
}

const drawRoundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.lineTo(x + width - r, y)
  context.quadraticCurveTo(x + width, y, x + width, y + r)
  context.lineTo(x + width, y + height - r)
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  context.lineTo(x + r, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - r)
  context.lineTo(x, y + r)
  context.quadraticCurveTo(x, y, x + r, y)
  context.closePath()
}

const drawNode = (context: CanvasRenderingContext2D, node: LowCodeNode) => {
  const size = getNodeSize(node)
  context.save()
  context.fillStyle = '#0f172a'
  context.strokeStyle = '#1e293b'
  context.lineWidth = 2 / camera.zoom
  drawRoundedRect(context, node.position.x, node.position.y, size.width, size.height, 8 / camera.zoom)
  context.fill()
  context.stroke()

  context.fillStyle = '#f1f5f9'
  context.font = `${14 / camera.zoom}px Inter, sans-serif`
  context.textBaseline = 'top'
  context.fillText(node.label, node.position.x + 12 / camera.zoom, node.position.y + 10 / camera.zoom)

  for (const port of node.ports) {
    const portPosition = getPortWorldPosition(node, port)
    context.beginPath()
    const radius = PORT_RADIUS / camera.zoom
    context.fillStyle = hoverPort.value && hoverPort.value.node.id === node.id && hoverPort.value.port.id === port.id ? '#38bdf8' : '#0ea5e9'
    context.arc(portPosition.x, portPosition.y, radius, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

const drawConnection = (context: CanvasRenderingContext2D, connection: LowCodeConnection) => {
  const points = getConnectionPoints(connection)
  if (!points) {
    return
  }
  const isHovered = hoverConnectionId.value === connection.id
  const controlOffset = Math.max(Math.abs(points.end.x - points.start.x), 60)
  context.save()
  context.strokeStyle = isHovered ? '#38bdf8' : '#94a3b8'
  context.lineWidth = (isHovered ? 4 : 3) / camera.zoom
  context.beginPath()
  context.moveTo(points.start.x, points.start.y)
  context.bezierCurveTo(
    points.start.x + controlOffset,
    points.start.y,
    points.end.x - controlOffset,
    points.end.y,
    points.end.x,
    points.end.y
  )
  context.stroke()
  context.restore()
}

const drawPendingConnection = (context: CanvasRenderingContext2D) => {
  if (!pendingConnection.value) {
    return
  }
  context.save()
  context.strokeStyle = '#38bdf8'
  context.lineWidth = 3 / camera.zoom
  context.setLineDash([10 / camera.zoom, 8 / camera.zoom])
  context.beginPath()
  context.moveTo(pendingConnection.value.start.x, pendingConnection.value.start.y)
  context.lineTo(pendingConnection.value.current.x, pendingConnection.value.current.y)
  context.stroke()
  context.restore()
}

const draw = () => {
  if (!board.value || !ctx.value) {
    return
  }
  const canvas = board.value
  const context = ctx.value
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.restore()

  context.save()
  context.translate(camera.offset.x, camera.offset.y)
  context.scale(camera.zoom, camera.zoom)

  drawGrid(context, canvas.width, canvas.height)

  for (const connection of props.connections) {
    drawConnection(context, connection)
  }

  drawPendingConnection(context)

  for (const node of interactiveNodes.value) {
    drawNode(context, node)
  }

  context.restore()

  animationFrameId = window.requestAnimationFrame(draw)
}

onMounted(() => {
  nextTick(() => {
    if (!board.value) {
      return
    }
    const context = board.value.getContext('2d')
    if (!context) {
      return
    }
    ctx.value = context
    camera.offset = { x: board.value.clientWidth / 2, y: board.value.clientHeight / 2 }
    animationFrameId = window.requestAnimationFrame(draw)
  })
})

onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
})
</script>
