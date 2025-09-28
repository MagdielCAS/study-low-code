<template>
  <div class="w-full h-full relative overflow-hidden m-0 p-0">
    <canvas ref="board" class="w-full h-full" @mousedown="onPointerDown" @mouseup="onPointerUp" @mousemove="onPointerMove" @wheel="wheelEvent" @touchstart="touchStartEvent" @touchend="touchEndEvent" @touchmove="touchMoveEvent"/>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue'

const board = ref<HTMLCanvasElement | null>(null)
let ctx = board.value?.getContext('2d')

const cameraOffset = ref({ x: 0, y: 0 })
const cameraZoom = ref(1)
const MAX_ZOOM = 5
const MIN_ZOOM = 0.1
const SCROLL_SENSITIVITY = 0.0005

const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })

let initialPinchDistance: number | null = null
let lastZoom = cameraZoom.value
let animationFrameId: number;

function draw() {
  if (!board.value || !ctx)
    return

  board.value.width = window.innerWidth
  board.value.height = window.innerHeight

  // Translate to the canvas centre before zooming
  ctx.translate(window.innerWidth / 2, window.innerHeight / 2)
  ctx.scale(cameraZoom.value, cameraZoom.value)
  ctx.translate(-window.innerWidth / 2 + cameraOffset.value.x, -window.innerHeight / 2 + cameraOffset.value.y)
  
  animationFrameId = requestAnimationFrame(draw)
}

function getEventLocation(e: MouseEvent | TouchEvent): { x: number, y: number } | undefined {
  if ('touches' in e && e.touches.length === 1)
    return { x: e.touches[0]?.clientX ?? 0, y: e.touches[0]?.clientY ?? 0 }

  if ('clientX' in e && 'clientY' in e)
    return { x: e.clientX, y: e.clientY }
}

function onPointerDown(e: MouseEvent | TouchEvent) {
  isDragging.value = true
  const location = getEventLocation(e)
  if (!location)
    return
  dragStart.value.x = location.x / cameraZoom.value - cameraOffset.value.x
  dragStart.value.y = location.y / cameraZoom.value - cameraOffset.value.y
}

function onPointerUp() {
  isDragging.value = false
  initialPinchDistance = null
  lastZoom = cameraZoom.value
}

function onPointerMove(e: MouseEvent | TouchEvent) {
  if (isDragging.value) {
    const location = getEventLocation(e)
    if (!location)
      return
    cameraOffset.value.x = location.x / cameraZoom.value - dragStart.value.x
    cameraOffset.value.y = location.y / cameraZoom.value - dragStart.value.y
  }
}

function handleTouch(e: TouchEvent, singleTouchHandler: (event: TouchEvent) => void) {
  if (e.touches.length === 1) {
    singleTouchHandler(e)
  }
  else if (e.type === 'touchmove' && e.touches.length === 2) {
    isDragging.value = false
    handlePinch(e)
  }
}

function handlePinch(e: TouchEvent) {
  e.preventDefault()

  const touch1 = { x: e.touches[0]?.clientX ?? 0, y: e.touches[0]?.clientY ?? 0 }
  const touch2 = { x: e.touches[1]?.clientX ?? 0, y: e.touches[1]?.clientY ?? 0 }

  const currentDistance = (touch1.x - touch2.x) ** 2 + (touch1.y - touch2.y) ** 2

  if (initialPinchDistance === null) {
    initialPinchDistance = currentDistance
  }
  else {
    adjustZoom(null, currentDistance / initialPinchDistance)
  }
}

function adjustZoom(zoomAmount?: number | null, zoomFactor?: number | null) {
  if (!isDragging.value) {
    if (zoomAmount) {
      cameraZoom.value += zoomAmount
    }
    else if (zoomFactor) {
      cameraZoom.value = zoomFactor * lastZoom
    }

    cameraZoom.value = Math.min(cameraZoom.value, MAX_ZOOM)
    cameraZoom.value = Math.max(cameraZoom.value, MIN_ZOOM)
  }
}

const wheelEvent = (event: WheelEvent) => {
  adjustZoom(event.deltaY * SCROLL_SENSITIVITY)
}

const touchStartEvent = (event: TouchEvent) => {
  handleTouch(event, onPointerDown)
}

const touchEndEvent = (event: TouchEvent) => {
  handleTouch(event, onPointerUp as () => void)
}

const touchMoveEvent = (event: TouchEvent) => {
  handleTouch(event, onPointerMove)
}

onMounted(() => {
  if (board.value) {
    ctx = board.value.getContext('2d')
    cameraOffset.value = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    
    draw()
  }
})

onUnmounted(() => {
    cancelAnimationFrame(animationFrameId);
})

definePageMeta({
  layout: 'default',
})
</script>