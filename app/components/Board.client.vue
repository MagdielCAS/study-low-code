<template>
  <canvas ref="board" class="w-full h-full" @mousedown="onPointerDown" @mouseup="onPointerUp" @mousemove="onPointerMove" @wheel="wheelEvent" @touchstart="touchStartEvent" @touchend="touchEndEvent" @touchmove="touchMoveEvent">Your browser does not support canvas.</canvas>
</template>

<script lang="ts" setup>
import type { Point } from '~/types/board'

const board = ref<HTMLCanvasElement | null>(null)
const ctx = ref(board.value?.getContext('2d') as CanvasRenderingContext2D | null | undefined)

type BoardProps = {
  drawCb: (board: Ref<HTMLCanvasElement | null>, context: Ref<CanvasRenderingContext2D | null | undefined>) => void
}

const {
  drawCb,
} = defineProps<BoardProps>();

const emit = defineEmits(['draw']);

const MAX_ZOOM = 3
const MIN_ZOOM = 1
const SCROLL_SENSITIVITY = 0.001

const isZooming = ref(false)
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const cameraOffset = ref({ x: 0, y: 0 })
const cameraZoom = ref(1)
const pointerLocation = ref<Point | null>(null)
const initialPinchDistance = ref<number | null>(null);
const lastZoom = ref(cameraZoom.value)
const animationFrameId = ref<number>();

const getEventLocation = (event?: MouseEvent | Touch): Point | null => {
  if (!event) {
    return null
  }

  return { x: event.clientX, y: event.clientY }
}

const onPointerDown = (event: MouseEvent | Touch) => {
  isDragging.value = true
  const location = getEventLocation(event)
  if (!location) {
    return null;
  }
  dragStart.value.x = location.x / cameraZoom.value - cameraOffset.value.x
  dragStart.value.y = location.y / cameraZoom.value - cameraOffset.value.y
}


const onPointerUp = () => {
  isDragging.value = false
  initialPinchDistance.value = null
  lastZoom.value = cameraZoom.value
}

const onPointerMove = (event: MouseEvent | Touch) => {
  pointerLocation.value = getEventLocation(event)

  if (!isDragging.value) {
    return
  }

  const location = getEventLocation(event)
  if (!location) {
    return
  }


  const offsetX = location.x / cameraZoom.value - dragStart.value.x
  const offsetY = location.y / cameraZoom.value - dragStart.value.y

  const isOffsetXNegative = offsetX < 0
  const isOffsetYNegative = offsetY < 0

  const normalisedOffsetX = Math.max(Math.min(Math.abs(offsetX), window.innerWidth * MAX_ZOOM), 0)
  const normalisedOffsetY = Math.max(Math.min(Math.abs(offsetY), window.innerHeight * MAX_ZOOM), 0)


  cameraOffset.value.x = isOffsetXNegative ? -1 * normalisedOffsetX : normalisedOffsetX;
  cameraOffset.value.y = isOffsetYNegative ? -1 * normalisedOffsetY : normalisedOffsetY;
}

const handlePinch = (event: TouchEvent) => {
  if (event.type !== 'touchmove' || event.touches.length !== 2){
    return
  }
  isDragging.value = false
  event.preventDefault()

  const touch1 = getEventLocation(event.touches[0])
  const touch2 = getEventLocation(event.touches[1])
  if (!touch1 || !touch2) {
    return
  }
  isZooming.value = true
  useDebounceFn(()=>{
    isZooming.value = false
  }, 300);
  const currentDistance = euclidianDistance(touch1, touch2)

  const centerX = (touch1.x + touch2.x) / 2
  const centerY = (touch1.y + touch2.y) / 2

  pointerLocation.value = { x: centerX, y: centerY };

  if (!initialPinchDistance.value) {
    initialPinchDistance.value = currentDistance
    return
  }

  const factor = currentDistance / initialPinchDistance.value
  const amount = factor * lastZoom.value
  adjustZoom(amount)
}

const adjustZoom = (zoomAmount?: number | null) => {
  if (isDragging.value || !zoomAmount) {
    return
  }
  isZooming.value = true
  useDebounceFn(()=>{
    isZooming.value = false
  }, 300);

  cameraZoom.value += zoomAmount
  cameraZoom.value = Math.min(cameraZoom.value, MAX_ZOOM)
  cameraZoom.value = Math.max(cameraZoom.value, MIN_ZOOM)
}


const wheelEvent = (event: WheelEvent) => {
  const amount = event.deltaY * SCROLL_SENSITIVITY
  adjustZoom(amount);
}

const touchStartEvent = (event: TouchEvent) => {
  isZooming.value = false
  if (event.touches.length === 1 && event.touches[0]) {
    onPointerDown(event.touches[0])
    return;
  }
  handlePinch(event);
}

const touchEndEvent = (event: TouchEvent) => {
  isZooming.value = false
   if (event.touches.length === 1) {
    onPointerUp()
  }
  handlePinch(event);
}

const touchMoveEvent = (event: TouchEvent) => {
  isZooming.value = false
  if (event.touches.length === 1 && event.touches[0]) {
    onPointerMove(event.touches[0])
  }
  handlePinch(event);
}

const draw = () => {
  if (!board.value || !ctx.value) {
    return
  }

  board.value.width = window.innerWidth
  board.value.height = window.innerHeight

  const target: Point = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  if (isZooming.value) {
    target.x = pointerLocation.value?.x || window.innerWidth / 2
    target.y = pointerLocation.value?.y || window.innerHeight / 2
  }


  ctx.value?.translate(target.x, target.y)
  ctx.value.scale(cameraZoom.value, cameraZoom.value)
  ctx.value.translate(-target.x + cameraOffset.value.x, -target.y + cameraOffset.value.y)
  
  // Draw pointer grid

  const canvasWidth = board.value.width;
  const canvasHeight = board.value.height;
  const circle = drawCircle(ctx.value);

  const sizeW = canvasWidth * cameraZoom.value * MAX_ZOOM
  const sizeH = canvasHeight * cameraZoom.value * MAX_ZOOM

  for (let i = 10; i < sizeW; i += 20) {
    for (let j = 10; j < sizeH; j += 20) {
      const radius = Math.min(Math.max(2 * 1/cameraZoom.value, 2), 1)
      circle(-window.innerWidth / 2 + i * cameraZoom.value, -window.innerHeight / 2 + j * cameraZoom.value, radius, 'red');
    }
  }

  drawCb(board, ctx);
  emit('draw');

  animationFrameId.value = requestAnimationFrame(draw);
}
onMounted(() => {
  if (board.value) {
    ctx.value = board.value.getContext('2d')
    cameraOffset.value = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    
    draw()
  }
})

onUnmounted(() => {
    if(animationFrameId.value){
      cancelAnimationFrame(animationFrameId.value);
    }
})
</script>
