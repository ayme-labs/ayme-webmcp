<script setup lang="ts">
import { computed, ref } from "vue";

type ListItem = {
  id: string;
  text: string;
  archived: boolean;
};

const items = ref<ListItem[]>([
  { id: "item-1", text: "Prepare launch notes", archived: false },
  { id: "item-2", text: "Review onboarding flow", archived: false },
]);
const nextItemNumber = ref(3);
const newItemText = ref("");
const inputError = ref("");
const archiveTargetId = ref<string>();
const editingItemId = ref<string>();
const editingItemText = ref("");

const activeItems = computed(() =>
  items.value.filter((item) => !item.archived)
);
const archivedItems = computed(() =>
  items.value.filter((item) => item.archived)
);
const archiveTarget = computed(() =>
  items.value.find((item) => item.id === archiveTargetId.value)
);

function addItem() {
  const text = newItemText.value.trim();
  if (!text) {
    inputError.value = "Enter an item name first.";
    return;
  }

  items.value.push({
    id: `item-${nextItemNumber.value}`,
    text,
    archived: false,
  });
  nextItemNumber.value += 1;
  newItemText.value = "";
  inputError.value = "";
}

function openArchive(itemId: string) {
  const item = items.value.find((candidate) => candidate.id === itemId);
  if (!item || item.archived) return;
  archiveTargetId.value = itemId;
}

function startRenaming(itemId: string) {
  const item = items.value.find((candidate) => candidate.id === itemId);
  if (!item || item.archived) return;
  editingItemId.value = item.id;
  editingItemText.value = item.text;
}

function renameItem(itemId: string) {
  const item = items.value.find((candidate) => candidate.id === itemId);
  const text = editingItemText.value.trim();
  if (!item || !text) return;

  item.text = text;
  editingItemId.value = undefined;
  editingItemText.value = "";
}

function cancelArchive() {
  archiveTargetId.value = undefined;
}

function confirmArchive() {
  const item = archiveTarget.value;
  if (!item) return;

  item.archived = true;
  archiveTargetId.value = undefined;
}
</script>

<template>
  <section class="demo-panel" aria-label="Demo application">
    <div class="panel-heading">
      <div>
        <p class="eyebrow">Demo application</p>
        <h2>My list</h2>
      </div>
      <span class="item-count">{{ activeItems.length }} active</span>
    </div>

    <form
      class="add-item-form"
      aria-label="Add a list item"
      @submit.prevent="addItem"
    >
      <label for="new-item">New item</label>
      <div class="form-row">
        <input
          id="new-item"
          v-model="newItemText"
          autocomplete="off"
          placeholder="e.g. Send the project update"
        />
        <button class="primary-button" type="submit">Add item</button>
      </div>
      <p v-if="inputError" class="form-error" role="alert">{{ inputError }}</p>
    </form>

    <section class="list-card" aria-labelledby="active-items-heading">
      <div class="section-heading">
        <h3 id="active-items-heading">Active items</h3>
        <span>{{ activeItems.length }}</span>
      </div>
      <ul v-if="activeItems.length" class="item-list">
        <li v-for="item in activeItems" :key="item.id" class="item-row">
          <div>
            <input
              v-if="editingItemId === item.id"
              v-model="editingItemText"
              aria-label="Item name"
              @blur="renameItem(item.id)"
              @keyup.enter="renameItem(item.id)"
            />
            <button
              v-else
              class="item-name-button"
              data-action="rename"
              type="button"
              @click="startRenaming(item.id)"
            >
              {{ item.text }}
            </button>
            <code>{{ item.id }}</code>
          </div>
          <button
            data-action="archive"
            type="button"
            :aria-label="`Archive ${item.id}`"
            @click="openArchive(item.id)"
          >
            Archive
          </button>
        </li>
      </ul>
      <p v-else class="empty-state">No active items. Add one above.</p>
    </section>

    <section
      class="list-card archived-card"
      aria-labelledby="archived-items-heading"
    >
      <div class="section-heading">
        <h3 id="archived-items-heading">Archived items</h3>
        <span>{{ archivedItems.length }}</span>
      </div>
      <ul v-if="archivedItems.length" class="item-list">
        <li
          v-for="item in archivedItems"
          :key="item.id"
          class="item-row archived-row"
        >
          <div>
            <strong>{{ item.text }}</strong>
            <code>{{ item.id }}</code>
          </div>
          <span class="archived-label">Archived</span>
        </li>
      </ul>
      <p v-else class="empty-state">Archived items will appear here.</p>
    </section>

    <div v-if="archiveTarget" class="dialog-backdrop">
      <div
        class="archive-dialog"
        role="dialog"
        aria-label="Archive item"
        aria-modal="true"
      >
        <p class="eyebrow">Confirmation</p>
        <h3>Archive this item?</h3>
        <p>
          <strong>{{ archiveTarget.text }}</strong> will move to the archived
          list.
        </p>
        <div class="dialog-actions">
          <button type="button" @click="cancelArchive">Cancel</button>
          <button class="primary-button" type="button" @click="confirmArchive">
            Confirm archive
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
