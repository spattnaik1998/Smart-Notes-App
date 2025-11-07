/**
 * Gen-AI Notes App - Client-side JavaScript
 * Minimal vanilla JS for API interactions and UI updates
 */

// Configuration
const API_BASE = '/api';

// State
let state = {
  userId: 'demo-user-id', // In production, get from auth
  chapters: [],
  currentChapter: null,
  currentNote: null,
  elaborationCache: {},
  hasUnsavedChanges: false,
  isOnline: navigator.onLine,
};

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('📝 Notes App initialized');
  loadChapters();

  // Auto-save on Ctrl/Cmd+S
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentNote();
    }
  });

  // Auto-save debounce (1500ms) and blur events
  let saveTimeout;
  const autoSaveElements = ['note-title-input', 'note-body-input', 'image-caption-input'];
  autoSaveElements.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      // Debounced save on input
      element.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        setSaveStatus('unsaved');
        saveTimeout = setTimeout(() => saveCurrentNote(), 1500);
      });

      // Immediate save on blur (when user clicks away)
      element.addEventListener('blur', () => {
        clearTimeout(saveTimeout); // Cancel debounce if active
        if (state.currentNote && state.hasUnsavedChanges) {
          saveCurrentNote();
        }
      });
    }
  });
});

// ============================================================================
// API Calls
// ============================================================================

async function apiCall(endpoint, options = {}) {
  try {
    // Check if online
    if (!navigator.onLine) {
      throw new Error('You are offline. Changes will be saved when connection is restored.');
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API request failed');
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);

    // Handle offline errors gracefully
    if (error.message.includes('offline') || error.name === 'TypeError' && !navigator.onLine) {
      showToast('⚠️ Offline - changes will be saved when reconnected', 'warning');
      setSaveStatus('offline');
    } else {
      showToast(error.message, 'error');
      setSaveStatus('error');
    }
    throw error;
  }
}

// ============================================================================
// Chapters
// ============================================================================

async function loadChapters() {
  try {
    const chapters = await apiCall('/chapters');
    state.chapters = chapters;
    renderChapters();
  } catch (error) {
    document.getElementById('chapters-list').innerHTML = `
      <div class="p-4 text-center text-red-500">
        <p>Failed to load chapters</p>
        <button onclick="loadChapters()" class="text-blue-600 hover:underline mt-2">Retry</button>
      </div>
    `;
  }
}

function renderChapters() {
  const container = document.getElementById('chapters-list');

  if (state.chapters.length === 0) {
    container.innerHTML = `
      <div class="p-4 text-center text-gray-500">
        <p>No chapters yet</p>
        <p class="text-sm mt-2">Create your first chapter to get started</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.chapters.map(chapter => `
    <div class="mb-4 last:mb-0">
      <!-- Chapter Header -->
      <div class="px-4 py-3 bg-gray-100 font-semibold text-gray-800 flex items-center justify-between group">
        <span>${escapeHtml(chapter.title)}</span>
        <button
          onclick="showNewNoteOptions('${chapter.id}')"
          class="text-blue-600 hover:text-blue-700 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
        >
          + Note
        </button>
      </div>

      <!-- Notes List -->
      <div class="bg-white">
        ${renderNotesList(chapter)}
      </div>
    </div>
  `).join('');
}

function renderNotesList(chapter) {
  if (!chapter.notes || chapter.notes.length === 0) {
    return `
      <div class="px-4 py-3 text-sm text-gray-500 italic">
        No notes yet
      </div>
    `;
  }

  return chapter.notes.map(note => `
    <div
      onclick="selectNote('${note.id}')"
      class="px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 flex items-center justify-between group ${state.currentNote?.id === note.id ? 'bg-blue-50' : ''}"
    >
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium text-gray-800 truncate">
          ${note.kind === 'image' ? '🖼️ ' : ''}${escapeHtml(note.title)}
        </div>
        <div class="text-xs text-gray-500">
          ${formatDate(note.updatedAt)}
        </div>
      </div>
      <button
        onclick="openElaborationDrawer('${note.id}'); event.stopPropagation()"
        class="ml-2 text-xl opacity-0 group-hover:opacity-100 hover:scale-110 transition-all"
        title="Elaborate"
      >
        💬
      </button>
    </div>
  `).join('');
}

function showNewChapterModal() {
  document.getElementById('new-chapter-modal').classList.remove('hidden');
  document.getElementById('new-chapter-title').focus();
}

function closeNewChapterModal() {
  document.getElementById('new-chapter-modal').classList.add('hidden');
  document.getElementById('new-chapter-title').value = '';
  document.getElementById('new-chapter-description').value = '';
}

async function createChapter() {
  const title = document.getElementById('new-chapter-title').value.trim();
  const description = document.getElementById('new-chapter-description').value.trim();

  if (!title) {
    showToast('Please enter a chapter title', 'error');
    return;
  }

  try {
    await apiCall('/chapters', {
      method: 'POST',
      body: JSON.stringify({
        userId: state.userId,
        title,
        description: description || undefined,
      }),
    });

    showToast('Chapter created successfully');
    closeNewChapterModal();
    loadChapters();
  } catch (error) {
    // Error already handled by apiCall
  }
}

function showNewNoteOptions(chapterId) {
  const choice = confirm('Create a text note? (Cancel for image note)');

  if (choice) {
    createTextNote(chapterId);
  } else {
    createImageNote(chapterId);
  }
}

async function createTextNote(chapterId) {
  try {
    const note = await apiCall('/notes', {
      method: 'POST',
      body: JSON.stringify({
        chapterId,
        title: 'New Note',
        bodyMd: '',
      }),
    });

    showToast('Note created');
    await loadChapters();
    selectNote(note.id);
  } catch (error) {
    // Error already handled
  }
}

function createImageNote(chapterId) {
  state.currentChapter = chapterId;
  showImageUploadSection();
}

// ============================================================================
// Notes
// ============================================================================

async function selectNote(noteId) {
  try {
    const note = await apiCall(`/notes/${noteId}`);
    state.currentNote = note;
    renderNoteEditor();
  } catch (error) {
    // Error already handled
  }
}

function renderNoteEditor() {
  const note = state.currentNote;

  // Update header
  document.getElementById('current-note-title').textContent = note.title;
  document.getElementById('current-note-meta').textContent = `
    ${note.kind === 'image' ? 'Image' : 'Text'} note • ${formatDate(note.updatedAt)}
  `;

  // Show/hide buttons
  document.getElementById('save-btn').classList.remove('hidden');
  document.getElementById('delete-btn').classList.remove('hidden');

  // Hide empty state
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('image-upload-section').classList.add('hidden');

  if (note.kind === 'text') {
    // Show text editor
    document.getElementById('text-editor').classList.remove('hidden');
    document.getElementById('image-viewer').classList.add('hidden');

    document.getElementById('note-title-input').value = note.title;
    document.getElementById('note-body-input').value = note.bodyMd || '';
  } else if (note.kind === 'image') {
    // Show image viewer
    document.getElementById('image-viewer').classList.remove('hidden');
    document.getElementById('text-editor').classList.add('hidden');

    document.getElementById('image-caption-input').value = note.imageCaption || '';
    document.getElementById('image-preview').src = note.imageUrl;

    // Render tags if available
    const tagsContainer = document.getElementById('image-tags');
    if (note.elaborationJson) {
      try {
        const data = JSON.parse(note.elaborationJson);
        if (data.tags && data.tags.length > 0) {
          tagsContainer.innerHTML = data.tags.map(tag =>
            `<span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">${escapeHtml(tag)}</span>`
          ).join('');
        }
      } catch (e) {
        console.error('Failed to parse elaboration JSON:', e);
      }
    }
  }
}

function showImageUploadSection() {
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('text-editor').classList.add('hidden');
  document.getElementById('image-viewer').classList.add('hidden');
  document.getElementById('image-upload-section').classList.remove('hidden');
  document.getElementById('save-btn').classList.add('hidden');
  document.getElementById('delete-btn').classList.add('hidden');
  document.getElementById('current-note-title').textContent = 'Upload Image';
  document.getElementById('current-note-meta').textContent = '';
}

async function saveCurrentNote() {
  if (!state.currentNote) return;

  const note = state.currentNote;

  try {
    setSaveStatus('saving');

    if (note.kind === 'text') {
      const title = document.getElementById('note-title-input').value.trim();
      const bodyMd = document.getElementById('note-body-input').value;

      await apiCall(`/notes/${note.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, bodyMd }),
      });

      state.currentNote.title = title;
      state.currentNote.bodyMd = bodyMd;
      state.hasUnsavedChanges = false;
      setSaveStatus('saved');
      await loadChapters();
    } else if (note.kind === 'image') {
      const imageCaption = document.getElementById('image-caption-input').value.trim();

      await apiCall(`/notes/${note.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ imageCaption }),
      });

      state.hasUnsavedChanges = false;
      setSaveStatus('saved');
      await loadChapters();
    }
  } catch (error) {
    // Error already handled by apiCall
    if (!navigator.onLine) {
      // Queue for later save when back online
      queueOfflineSave(note.id);
    }
  }
}

async function deleteCurrentNote() {
  if (!state.currentNote) return;

  if (!confirm('Are you sure you want to delete this note?')) {
    return;
  }

  try {
    await apiCall(`/notes/${state.currentNote.id}`, {
      method: 'DELETE',
    });

    showToast('Note deleted');
    state.currentNote = null;
    await loadChapters();
    showEmptyState();
  } catch (error) {
    // Error already handled
  }
}

function showEmptyState() {
  document.getElementById('empty-state').classList.remove('hidden');
  document.getElementById('text-editor').classList.add('hidden');
  document.getElementById('image-viewer').classList.add('hidden');
  document.getElementById('image-upload-section').classList.add('hidden');
  document.getElementById('save-btn').classList.add('hidden');
  document.getElementById('delete-btn').classList.add('hidden');
  document.getElementById('current-note-title').textContent = 'Select a note or create a new one';
  document.getElementById('current-note-meta').textContent = '';
}

async function uploadImage() {
  const fileInput = document.getElementById('image-file-input');
  const file = fileInput.files[0];

  if (!file) return;

  if (!state.currentChapter) {
    showToast('Please select a chapter first', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('chapterId', state.currentChapter);
  formData.append('file', file);

  try {
    showToast('Uploading image...');

    const response = await fetch(`${API_BASE}/notes/image`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Upload failed');
    }

    const result = await response.json();

    showToast('Image uploaded successfully');
    fileInput.value = '';
    await loadChapters();
    selectNote(result.note_id);
  } catch (error) {
    console.error('Upload error:', error);
    showToast(error.message, 'error');
  }
}

function previewMarkdown() {
  const bodyMd = document.getElementById('note-body-input').value;
  const html = marked.parse(bodyMd);

  const previewWindow = window.open('', 'Preview', 'width=800,height=600');
  previewWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Preview</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        .markdown-content h1 { @apply text-2xl font-bold mt-6 mb-4; }
        .markdown-content h2 { @apply text-xl font-bold mt-5 mb-3; }
        .markdown-content h3 { @apply text-lg font-semibold mt-4 mb-2; }
        .markdown-content p { @apply mb-3; }
        .markdown-content ul, .markdown-content ol { @apply ml-6 mb-3; }
        .markdown-content code { @apply bg-gray-100 px-1 py-0.5 rounded text-sm font-mono; }
        .markdown-content pre { @apply bg-gray-100 p-4 rounded mb-4; }
        .markdown-content a { @apply text-blue-600 hover:underline; }
      </style>
    </head>
    <body class="p-8 bg-gray-50">
      <div class="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow">
        <div class="markdown-content">${html}</div>
      </div>
    </body>
    </html>
  `);
  previewWindow.document.close();
}

// ============================================================================
// Elaboration Drawer
// ============================================================================

async function openElaborationDrawer(noteId) {
  const drawer = document.getElementById('elaboration-drawer');
  drawer.classList.remove('hidden');

  // Load note if not current
  if (!state.currentNote || state.currentNote.id !== noteId) {
    await selectNote(noteId);
  }

  loadElaboration(noteId);
}

function closeElaborationDrawer() {
  document.getElementById('elaboration-drawer').classList.add('hidden');
}

async function loadElaboration(noteId, force = false) {
  // Show loading state
  document.getElementById('elaboration-loading').classList.remove('hidden');
  document.getElementById('elaboration-content').classList.add('hidden');
  document.getElementById('elaboration-error').classList.add('hidden');

  try {
    const result = await apiCall(`/notes/${noteId}/elaborate`, {
      method: 'POST',
      body: JSON.stringify({ force }),
    });

    state.elaborationCache[noteId] = result;
    renderElaboration(result);
  } catch (error) {
    showElaborationError(error.message);
  }
}

function renderElaboration(data) {
  // Hide loading
  document.getElementById('elaboration-loading').classList.add('hidden');
  document.getElementById('elaboration-content').classList.remove('hidden');

  // Update metadata
  const cacheStatus = document.getElementById('cache-status');
  if (data.metadata?.cached) {
    cacheStatus.textContent = '✓ Cached';
    cacheStatus.className = 'px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium';
  } else {
    cacheStatus.textContent = '✨ Fresh';
    cacheStatus.className = 'px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium';
  }

  document.getElementById('sources-count').textContent = data.references?.length || 0;

  // Render sections
  const sectionsContainer = document.getElementById('elaboration-sections');
  sectionsContainer.innerHTML = (data.sections || []).map(section => `
    <div class="mb-6">
      <h3 class="text-sm font-semibold text-gray-500 uppercase mb-2">${escapeHtml(section.type)}</h3>
      <div class="markdown-content prose max-w-none">
        ${marked.parse(section.content)}
      </div>
    </div>
  `).join('');

  // Render references
  const referencesContainer = document.getElementById('references-list');
  if (data.references && data.references.length > 0) {
    referencesContainer.innerHTML = data.references.map(ref => `
      <div class="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div class="flex items-start">
          <span class="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold mr-3">
            ${ref.rank}
          </span>
          <div class="flex-1">
            <a
              href="${escapeHtml(ref.url)}"
              target="_blank"
              class="font-medium text-blue-600 hover:underline"
            >
              ${escapeHtml(ref.title)}
            </a>
            <p class="text-sm text-gray-600 mt-1">${escapeHtml(ref.snippet)}</p>
          </div>
        </div>
      </div>
    `).join('');
  } else {
    referencesContainer.innerHTML = '<p class="text-sm text-gray-500 italic">No references available</p>';
  }
}

function showElaborationError(message) {
  document.getElementById('elaboration-loading').classList.add('hidden');
  document.getElementById('elaboration-content').classList.add('hidden');
  document.getElementById('elaboration-error').classList.remove('hidden');
  document.getElementById('elaboration-error-message').textContent = message;
}

function retryElaboration() {
  if (state.currentNote) {
    loadElaboration(state.currentNote.id, true);
  }
}

function regenerateElaboration() {
  if (state.currentNote) {
    loadElaboration(state.currentNote.id, true);
  }
}

function copyElaboration() {
  const data = state.elaborationCache[state.currentNote?.id];
  if (!data) return;

  let text = '';

  // Add sections
  (data.sections || []).forEach(section => {
    text += `${section.content}\n\n`;
  });

  // Add references
  text += '\n## References\n\n';
  (data.references || []).forEach(ref => {
    text += `[${ref.rank}] ${ref.title}\n${ref.url}\n\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard');
  }).catch(() => {
    showToast('Failed to copy', 'error');
  });
}

// ============================================================================
// Utilities
// ============================================================================

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');

  toastMessage.textContent = message;
  toast.classList.remove('hidden', 'bg-red-600', 'bg-gray-800', 'bg-yellow-600');

  if (type === 'error') {
    toast.classList.add('bg-red-600');
  } else if (type === 'warning') {
    toast.classList.add('bg-yellow-600');
  } else {
    toast.classList.add('bg-gray-800');
  }

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

function setSaveStatus(status) {
  const statusElement = document.getElementById('save-status');
  if (!statusElement) return;

  state.hasUnsavedChanges = (status === 'unsaved');

  switch (status) {
    case 'saving':
      statusElement.textContent = '💾 Saving...';
      statusElement.className = 'text-sm text-blue-600 font-medium';
      break;
    case 'saved':
      statusElement.textContent = '✓ Saved';
      statusElement.className = 'text-sm text-green-600 font-medium';
      // Hide after 2 seconds
      setTimeout(() => {
        if (statusElement.textContent === '✓ Saved') {
          statusElement.textContent = '';
        }
      }, 2000);
      break;
    case 'unsaved':
      statusElement.textContent = '● Unsaved';
      statusElement.className = 'text-sm text-gray-500 font-medium';
      break;
    case 'offline':
      statusElement.textContent = '⚠️ Offline';
      statusElement.className = 'text-sm text-yellow-600 font-medium';
      break;
    case 'error':
      statusElement.textContent = '✗ Error';
      statusElement.className = 'text-sm text-red-600 font-medium';
      break;
    default:
      statusElement.textContent = '';
  }
}

// Queue offline saves
let offlineQueue = new Set();

function queueOfflineSave(noteId) {
  offlineQueue.add(noteId);
  console.log('Queued for offline save:', noteId);
}

// Handle online/offline events
window.addEventListener('online', async () => {
  console.log('Connection restored');
  state.isOnline = true;
  showToast('✓ Connection restored', 'success');

  // Process queued saves
  if (offlineQueue.size > 0) {
    showToast('Syncing offline changes...');
    for (const noteId of offlineQueue) {
      if (state.currentNote?.id === noteId) {
        try {
          await saveCurrentNote();
          offlineQueue.delete(noteId);
        } catch (error) {
          console.error('Failed to sync note:', noteId);
        }
      }
    }
  }
});

window.addEventListener('offline', () => {
  console.log('Connection lost');
  state.isOnline = false;
  showToast('⚠️ You are offline', 'warning');
  setSaveStatus('offline');
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
