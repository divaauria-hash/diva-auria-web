const DB_NAME = 'dicoding-story-db';
const DB_VERSION = 1;
const STORE_NAME = 'favorites';
const PENDING_STORE = 'pending-stories';

class StoryDB {
  constructor() {
    this.dbName = 'StoriesDB';
    this.version = 2; 
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains('stories')) {
          const store = db.createObjectStore('stories', { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('favorites')) {
          const favStore = db.createObjectStore('favorites', { keyPath: 'id' });
          favStore.createIndex('name', 'name', { unique: false });
        }

        if (!db.objectStoreNames.contains('pendingStories')) {
          const pendingStore = db.createObjectStore('pendingStories', { 
            keyPath: 'tempId',
            autoIncrement: true 
          });
          pendingStore.createIndex('description', 'description', { unique: false });
        }
      };
    });
  }

  async addStory(story) {
    const tx = this.db.transaction(['stories'], 'readwrite');
    const store = tx.objectStore('stories');
    return store.add(story);
  }

  async getAllStories() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['stories'], 'readonly');
      const store = tx.objectStore('stories');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteStory(id) {
    const tx = this.db.transaction(['stories'], 'readwrite');
    const store = tx.objectStore('stories');
    return store.delete(id);
  }

  async addFavorite(story) {
    const tx = this.db.transaction(['favorites'], 'readwrite');
    const store = tx.objectStore('favorites');
    return store.add(story);
  }

  async removeFavorite(id) {
    const tx = this.db.transaction(['favorites'], 'readwrite');
    const store = tx.objectStore('favorites');
    return store.delete(id);
  }

  async getFavorites() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['favorites'], 'readonly');
      const store = tx.objectStore('favorites');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async isFavorite(id) {
    const favorites = await this.getFavorites();
    return favorites.some(fav => fav.id === id);
  }

  async addPendingStory(story) {
    const tx = this.db.transaction(['pendingStories'], 'readwrite');
    const store = tx.objectStore('pendingStories');
    
    story.tempId = Date.now();
    story.createdAt = new Date().toISOString();
    story.synced = false;
    
    return store.add(story);
  }

  async getPendingStories() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['pendingStories'], 'readonly');
      const store = tx.objectStore('pendingStories');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async removePendingStory(tempId) {
    const tx = this.db.transaction(['pendingStories'], 'readwrite');
    const store = tx.objectStore('pendingStories');
    return store.delete(tempId);
  }

  async searchStories(query) {
    const stories = await this.getAllStories();
    return stories.filter(story => 
      story.name?.toLowerCase().includes(query.toLowerCase()) ||
      story.description?.toLowerCase().includes(query.toLowerCase())
    );
  }

  async filterByLocation(location) {
    const stories = await this.getAllStories();
    return stories.filter(story => story.name === location);
  }
}

export const storyDB = new StoryDB();