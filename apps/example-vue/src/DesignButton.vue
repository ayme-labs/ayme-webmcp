<script setup lang="ts">
const emit = defineEmits<{
  activate: [];
}>();

function emitActivate() {
  emit("activate");
}
</script>

<template>
  <button type="button" @click="emitActivate">
    <slot />
  </button>
</template>
