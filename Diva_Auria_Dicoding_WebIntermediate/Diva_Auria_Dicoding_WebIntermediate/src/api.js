const API_BASE = 'https://story-api.dicoding.dev/v1';
const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const removeToken = () => localStorage.removeItem(TOKEN_KEY);
export const getUser = () => JSON.parse(localStorage.getItem(USER_KEY) || '{}');
export const setUser = (user) => localStorage.setItem(USER_KEY, JSON.stringify(user));
export const removeUser = () => localStorage.removeItem(USER_KEY);
export const isAuthenticated = () => !!getToken();

export const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export const validatePassword = (password) => password.length >= 8;

export const api = {
  async register(name, email, password) {
    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Registration failed');
    return data;
  },

  async login(email, password) {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Login failed');
    setToken(data.loginResult.token);
    setUser(data.loginResult);
    return data;
  },

  async getStories() {
    console.log('🔄 Fetching stories from API...');
    const response = await fetch(`${API_BASE}/stories?location=1`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    console.log('📡 API Response status:', response.status);
    
    const data = await response.json();
    console.log('📊 Stories data received:', data);
    
    if (!response.ok) throw new Error('Failed to fetch stories');
    return data.listStory;
  },

  async addStory(description, photo, lat, lon) {
    const formData = new FormData();
    formData.append('description', description);
    formData.append('photo', photo);
    if (lat) formData.append('lat', lat);
    if (lon) formData.append('lon', lon);

    const response = await fetch(`${API_BASE}/stories`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to add story');
    return data;
  }
};

export async function syncPendingStories(storyDB) {
  if (!storyDB) {
    console.error('storyDB is not available');
    return;
  }

  const pending = await storyDB.getPendingStories();
  
  for (const story of pending) {
    try {
      await api.addStory(
        story.description,
        story.photo,
        story.lat,
        story.lon
      );
      await storyDB.removePendingStory(story.tempId);
      console.log('Synced pending story:', story.tempId);
    } catch (error) {
      console.error('Failed to sync story:', error);
    }
  }
  
  if (pending.length > 0) {
    alert(`${pending.length} pending stories synced!`);
    window.location.reload();
  }
}