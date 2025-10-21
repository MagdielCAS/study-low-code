<template>
  <div class="flex-1 relative m-0 p-0">
    <Board
      :nodes="nodes"
      :connections="connections"
      class="flex-1"
      @node-move="onNodeMove"
      @connection-create="onConnectionCreate"
      @connection-delete="onConnectionDelete"
    />
    <pre
      class="absolute bottom-4 right-4 max-w-md max-h-60 overflow-auto rounded-md bg-slate-900/80 p-4 text-xs text-slate-200"
    >{{ formattedSerialized }}</pre>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import type { LowCodeConnection, LowCodeNode, LowCodePoint } from '~/types/lowCode'

const initialNodes: LowCodeNode[] = [
  {
    id: 'trigger',
    label: 'Trigger Event',
    position: { x: -220, y: -60 },
    width: 180,
    height: 110,
    ports: [
      {
        id: 'trigger-output',
        label: 'Out',
        direction: 'output',
        position: { x: 180, y: 55 }
      }
    ]
  },
  {
    id: 'transform',
    label: 'Transform Data',
    position: { x: 80, y: -40 },
    width: 220,
    height: 120,
    ports: [
      {
        id: 'transform-input',
        label: 'In',
        direction: 'input',
        position: { x: 0, y: 60 }
      },
      {
        id: 'transform-output',
        label: 'Out',
        direction: 'output',
        position: { x: 220, y: 60 }
      }
    ]
  },
  {
    id: 'destination',
    label: 'Send Notification',
    position: { x: 440, y: -20 },
    width: 200,
    height: 110,
    ports: [
      {
        id: 'destination-input',
        label: 'In',
        direction: 'input',
        position: { x: 0, y: 55 }
      }
    ]
  }
]

const initialConnections: LowCodeConnection[] = [
  {
    id: 'connection-1',
    source: { nodeId: 'trigger', portId: 'trigger-output' },
    target: { nodeId: 'transform', portId: 'transform-input' }
  }
]

const nodes = ref<LowCodeNode[]>(initialNodes)
const connections = ref<LowCodeConnection[]>(initialConnections)

const serialized = computed(() => ({
  nodes: nodes.value.map(({ id, label, position, ports }) => ({
    id,
    label,
    position,
    ports: ports.map(({ id: portId, direction }) => ({ id: portId, direction }))
  })),
  connections: connections.value.map(({ id, source, target }) => ({ id, source, target }))
}))

// biome-ignore lint/correctness/noUnusedVariables: consumed by the template preview block
const formattedSerialized = computed(() => JSON.stringify(serialized.value, null, 2))

const updateNodePosition = (nodeId: string, position: LowCodePoint) => {
  nodes.value = nodes.value.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          position: { x: position.x, y: position.y }
        }
      : node
  )
}

// biome-ignore lint/correctness/noUnusedVariables: emitted from Board component
const onNodeMove = ({ id, position }: { id: string; position: LowCodePoint }) => {
  updateNodePosition(id, position)
}

// biome-ignore lint/correctness/noUnusedVariables: emitted from Board component
const onConnectionCreate = (connection: LowCodeConnection) => {
  const exists = connections.value.some(
    (item) =>
      (item.id === connection.id) ||
      (item.source.nodeId === connection.source.nodeId &&
        item.source.portId === connection.source.portId &&
        item.target.nodeId === connection.target.nodeId &&
        item.target.portId === connection.target.portId)
  )
  if (exists) {
    return
  }
  connections.value = [...connections.value, connection]
}

// biome-ignore lint/correctness/noUnusedVariables: emitted from Board component
const onConnectionDelete = ({ id }: { id: string }) => {
  connections.value = connections.value.filter((connection) => connection.id !== id)
}
</script>
