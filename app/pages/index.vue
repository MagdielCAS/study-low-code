<template>
 <div class="flex-1 relative m-0 p-0">
    <Board :draw-cb="draw" class="flex-1"/>
  </div>
</template>

<script lang="ts" setup>


const draw = (board: Ref<HTMLCanvasElement | null>, ctx: Ref<CanvasRenderingContext2D | null | undefined>) => {
  // if (!ctx.value || !board.value) {
  //   return
  // }

}
</script>