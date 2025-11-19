import './styles.css';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { storyDB } from './db.js';
import { PushNotificationManager } from './push-notification.js';
import { api, isAuthenticated, getToken, setToken, setUser, removeToken, removeUser, validateEmail, validatePassword, syncPendingStories } from './api.js';

class PWAInstallManager {
  constructor() {
    this.deferredPrompt = null;
    this.setupInstallPrompt();
  }

  setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstallButton();
    });

    window.addEventListener('appinstalled', () => {
      this.hideInstallButton();
      this.deferredPrompt = null;
    });
  }

  showInstallButton() {
    let installBtn = document.getElementById('install-btn');
    if (!installBtn) {
      installBtn = document.createElement('button');
      installBtn.id = 'install-btn';
      installBtn.className = 'install-btn';
      installBtn.innerHTML = '📱 Install App';
      installBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #9262b3;
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 25px;
        cursor: pointer;
        z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      `;
      document.body.appendChild(installBtn);
    }
    
    installBtn.onclick = () => this.installApp();
    installBtn.style.display = 'block';
  }

  hideInstallButton() {
    const installBtn = document.getElementById('install-btn');
    if (installBtn) {
      installBtn.style.display = 'none';
    }
  }

  async installApp() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted install');
      }
      
      this.deferredPrompt = null;
      this.hideInstallButton();
    }
  }
}

const pushManager = new PushNotificationManager();
const pwaManager = new PWAInstallManager();

let router = null;

document.addEventListener('DOMContentLoaded', async () => {
  await storyDB.init();
  router = new Router(); 
  router.init();
  
  await pushManager.init();

  if (navigator.onLine) {
    await syncPendingStories(storyDB);
  }

  window.addEventListener('online', () => {
    syncPendingStories(storyDB);
  });
});

// ===============SERVICE WORKER REGISTRATION ===============
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('SW registered:', registration);
    } catch (error) {
      console.error('SW registration failed:', error);
    }
  });
}

// ==================== ROUTER CLASS ====================
class Router {
  constructor() {
    this.routes = {
      'home': this.renderHome.bind(this),
      'login': this.renderLogin.bind(this),
      'register': this.renderRegister.bind(this),
      'add-story': this.renderAddStory.bind(this)
    };
    this.app = document.getElementById('app');
  }

  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('load', () => this.handleRoute());
    this.setupNavigation();

    if (!window.location.hash) {
      window.location.hash = '#home';
    }
  }

  handleRoute() {
    const hash = window.location.hash.slice(1) || 'home';
    if (hash === 'add-story' && !isAuthenticated()) {
      window.location.hash = '#login';
      return;
    }

    const route = this.routes[hash];
    
    if (!route) {
      console.warn('⚠️ Route not found:', hash, 'falling back to home');
      this.routes['home']();
      return;
    }
    
    if (document.startViewTransition) {
      document.startViewTransition(() => route());
    } else {
      route();
    }
  }

  setupNavigation() {
    this.updateAuthUI();
    
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        removeToken();
        removeUser();
        window.location.hash = '#home'; 
        this.updateAuthUI();
      });
    }

    const menuToggle = document.querySelector('.menu-toggle');
    const navMenu = document.querySelector('.nav-menu');
    if (menuToggle && navMenu) {
      menuToggle.addEventListener('click', () => {
        const isActive = navMenu.classList.toggle('active');
        menuToggle.setAttribute('aria-expanded', isActive);
      });
    }

    const skipLink = document.querySelector('.skip-link');
    if (skipLink) {
      skipLink.addEventListener('click', (e) => {
        e.preventDefault();
        const mainContent = document.getElementById('main-content');
        if (mainContent) {
          mainContent.tabIndex = -1;
          mainContent.focus();
          setTimeout(() => mainContent.removeAttribute('tabindex'), 1000);
        }
      });
    }
  }

  updateAuthUI() {
    const authLinks = document.querySelectorAll('.auth-link');
    const logoutBtn = document.querySelector('.logout-btn');
    const homeLink = document.querySelector('.home-link');
    const addStoryLink = document.querySelector('.add-story-link');
    
    if (isAuthenticated()) {
      // User sudah login: tampilkan Home, Add Story, Logout
      authLinks.forEach(link => link.style.display = 'none');
      if (logoutBtn) logoutBtn.style.display = 'block';
      if (homeLink) homeLink.style.display = 'block';
      if (addStoryLink) addStoryLink.style.display = 'block';
    } else {
      // User belum login: tampilkan hanya Login dan Register
      authLinks.forEach(link => link.style.display = 'block');
      if (logoutBtn) logoutBtn.style.display = 'none';
      if (homeLink) homeLink.style.display = 'none';
      if (addStoryLink) addStoryLink.style.display = 'none';
    }
  }

  renderLogin() {
    this.app.innerHTML = `
      <div class="form-container">
        <h2>Login</h2>
        <form id="login-form" novalidate>
          <div class="form-group">
            <label for="email">Email:</label>
            <input type="email" id="email" name="email" required 
                   aria-describedby="email-error" placeholder="Enter your email">
            <span id="email-error" class="error-text" role="alert"></span>
          </div>
          <div class="form-group">
            <label for="password">Password:</label>
            <input type="password" id="password" name="password" required 
                   aria-describedby="password-error" placeholder="Enter your password">
            <span id="password-error" class="error-text" role="alert"></span>
          </div>
          <button type="submit" class="btn btn-primary">Login</button>
          <div class="form-link">
            <p>Don't have an account? <a href="#register">Register here</a></p>
          </div>
        </form>
        <div id="message" role="status" aria-live="polite"></div>
      </div>
    `;

    const form = document.getElementById('login-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const messageDiv = document.getElementById('message');

    const validateEmailField = () => {
      const email = emailInput.value.trim();
      const errorSpan = document.getElementById('email-error');
      if (!email) {
        errorSpan.textContent = 'Email is required';
        emailInput.setAttribute('aria-invalid', 'true');
        return false;
      }
      if (!validateEmail(email)) {
        errorSpan.textContent = 'Invalid email format';
        emailInput.setAttribute('aria-invalid', 'true');
        return false;
      }
      errorSpan.textContent = '';
      emailInput.setAttribute('aria-invalid', 'false');
      return true;
    };

    const validatePasswordField = () => {
      const password = passwordInput.value;
      const errorSpan = document.getElementById('password-error');
      if (!password) {
        errorSpan.textContent = 'Password is required';
        passwordInput.setAttribute('aria-invalid', 'true');
        return false;
      }
      if (!validatePassword(password)) {
        errorSpan.textContent = 'Password must be at least 8 characters';
        passwordInput.setAttribute('aria-invalid', 'true');
        return false;
      }
      errorSpan.textContent = '';
      passwordInput.setAttribute('aria-invalid', 'false');
      return true;
    };

    emailInput.addEventListener('blur', validateEmailField);
    passwordInput.addEventListener('blur', validatePasswordField);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!validateEmailField() || !validatePasswordField()) return;

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging in...';

      try {
        await api.login(emailInput.value.trim(), passwordInput.value);
        messageDiv.className = 'message message-success';
        messageDiv.textContent = 'Login successful! Redirecting...';
        this.updateAuthUI();
        setTimeout(() => window.location.hash = '#home', 1000);
      } catch (error) {
        messageDiv.className = 'message message-error';
        messageDiv.textContent = error.message;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
      }
    });
  }

   renderRegister() {
    this.app.innerHTML = `
      <div class="form-container">
        <h2>Register</h2>
        <form id="register-form" novalidate>
          <div class="form-group">
            <label for="name">Name:</label>
            <input type="text" id="name" name="name" required 
                   aria-describedby="name-error" placeholder="Enter your name">
            <span id="name-error" class="error-text" role="alert"></span>
          </div>
          <div class="form-group">
            <label for="email">Email:</label>
            <input type="email" id="email" name="email" required 
                   aria-describedby="email-error" placeholder="Enter your email">
            <span id="email-error" class="error-text" role="alert"></span>
          </div>
          <div class="form-group">
            <label for="password">Password:</label>
            <input type="password" id="password" name="password" required 
                   aria-describedby="password-error" placeholder="At least 8 characters">
            <span id="password-error" class="error-text" role="alert"></span>
          </div>
          <button type="submit" class="btn btn-primary">Register</button>
          <div class="form-link">
            <p>Already have an account? <a href="#login">Login here</a></p>
          </div>
        </form>
        <div id="message" role="status" aria-live="polite"></div>
      </div>
    `;

    const form = document.getElementById('register-form');
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const messageDiv = document.getElementById('message');

    const validateNameField = () => {
      const name = nameInput.value.trim();
      const errorSpan = document.getElementById('name-error');
      if (!name) {
        errorSpan.textContent = 'Name is required';
        nameInput.setAttribute('aria-invalid', 'true');
        return false;
      }
      if (name.length < 3) {
        errorSpan.textContent = 'Name must be at least 3 characters';
        nameInput.setAttribute('aria-invalid', 'true');
        return false;
      }
      errorSpan.textContent = '';
      nameInput.setAttribute('aria-invalid', 'false');
      return true;
    };

    const validateEmailField = () => {
      const email = emailInput.value.trim();
      const errorSpan = document.getElementById('email-error');
      if (!email) {
        errorSpan.textContent = 'Email is required';
        emailInput.setAttribute('aria-invalid', 'true');
        return false;
      }
      if (!validateEmail(email)) {
        errorSpan.textContent = 'Invalid email format';
        emailInput.setAttribute('aria-invalid', 'true');
        return false;
      }
      errorSpan.textContent = '';
      emailInput.setAttribute('aria-invalid', 'false');
      return true;
    };

    const validatePasswordField = () => {
      const password = passwordInput.value;
      const errorSpan = document.getElementById('password-error');
      if (!password) {
        errorSpan.textContent = 'Password is required';
        passwordInput.setAttribute('aria-invalid', 'true');
        return false;
      }
      if (!validatePassword(password)) {
        errorSpan.textContent = 'Password must be at least 8 characters';
        passwordInput.setAttribute('aria-invalid', 'true');
        return false;
      }
      errorSpan.textContent = '';
      passwordInput.setAttribute('aria-invalid', 'false');
      return true;
    };

    nameInput.addEventListener('blur', validateNameField);
    emailInput.addEventListener('blur', validateEmailField);
    passwordInput.addEventListener('blur', validatePasswordField);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!validateNameField() || !validateEmailField() || !validatePasswordField()) return;

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Registering...';

      try {
        await api.register(
          nameInput.value.trim(), 
          emailInput.value.trim(), 
          passwordInput.value
        );
        messageDiv.className = 'message message-success';
        messageDiv.textContent = 'Registration successful! Redirecting to login...';
        setTimeout(() => window.location.hash = '#login', 1500);
      } catch (error) {
        messageDiv.className = 'message message-error';
        messageDiv.textContent = error.message;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Register';
      }
    });
  }

  renderHome() {
    if (!isAuthenticated()) {
      this.app.innerHTML = `
        <div class="welcome-container">
          <div class="form-container" style="text-align: center;">
            <h2>Welcome to Dicoding Story by Diva Auria</h2>
            <p style="margin: 1.5rem 0; font-size: 1.1rem; color: var(--gray);">
              Share your stories with the world and discover amazing places!
            </p>
            <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 2rem; flex-wrap: wrap;">
              <a href="#login" class="btn btn-primary" style="text-decoration: none;">Login</a>
              <a href="#register" class="btn btn-secondary" style="text-decoration: none;">Register</a>
            </div>
            <div style="margin-top: 2rem; padding: 1.5rem; background: rgba(108, 92, 231, 0.05); border-radius: 12px;">
              <h3 style="color: var(--primary); margin-bottom: 1rem;">Features</h3>
              <ul style="text-align: left; display: inline-block;">
                <li>📖 Share your stories with photos</li>
                <li>🗺️ Add location to your stories</li>
                <li>⭐ Mark stories as favorites</li>
                <li>📱 Works offline with PWA</li>
              </ul>
            </div>
          </div>
        </div>
      `;
      return;
    }

    this.app.innerHTML = `
      <div class="home-container">
        <h2>Dicoding Stories Map</h2>
        
        <div class="controls">
          <label>
            Filter by Location:
            <select id="location-filter">
              <option value="all">All Locations</option>
            </select>
          </label>
          
          <label class="toggle-label">
            <span>Push Notifications</span>
            <label class="switch">
              <input type="checkbox" id="notification-toggle">
              <span class="slider"></span>
            </label>
          </label>

          <button id="show-favorites" class="btn btn-secondary">⭐ Favorites</button>

          <div id="connection-status" class="connection-status">
            <span class="status-indicator"></span>
            <span class="status-text">Checking...</span>
          </div>
        </div>

        <div class="content-layout">
          <div id="map" class="map-container" role="application" aria-label="Interactive map">
            <div class="loading">Loading map...</div>
          </div>
          
          <section class="stories-section">
            <h3>📖 Recent Stories</h3>
            <div id="story-list" class="story-list-grid">
              <div class="loading">Loading stories...</div>
            </div>
          </section>
        </div>
      </div>
    `;

    this.setupEnhancedControls();
    this.loadStoriesDirectly();
  }

  async loadStoriesDirectly() {
    const storyList = document.getElementById('story-list');
    const mapContainer = document.getElementById('map');
    
    try {
      console.log('📄 Starting to load stories...');
      
      storyList.innerHTML = '<div class="loading">Loading stories...</div>';
      mapContainer.innerHTML = '<div class="loading">Loading map...</div>';
      
      const stories = await api.getStories();
      console.log('📊 Stories loaded:', stories);
      
      if (stories && stories.length > 0) {
        await this.initHomeMap(stories);
      } else {
        storyList.innerHTML = '<p>No stories available. <a href="#add-story">Add the first story!</a></p>';
        mapContainer.innerHTML = '<div class="message message-info">No stories with location data</div>';
      }
    } catch (error) {
      console.error('❌ Error loading stories:', error);
      storyList.innerHTML = `
        <div class="message message-error">
          Failed to load stories: ${error.message}
          <button onclick="router.loadStoriesDirectly()" class="btn btn-secondary" style="margin-top: 0.5rem;">Retry</button>
        </div>
      `;
      mapContainer.innerHTML = '<div class="message message-error">Failed to load map</div>';
    }
  }

  setupEnhancedControls() {
    const notifToggle = document.getElementById('notification-toggle');
    if (notifToggle) {
      notifToggle.addEventListener('change', async (e) => {
        if (e.target.checked) {
          await pushManager.subscribe();
        } else {
          await pushManager.unsubscribe();
        }
      });
    }

    const favBtn = document.getElementById('show-favorites');
    if (favBtn) {
      favBtn.addEventListener('click', () => {
        this.showFavorites();
      });
    }

    this.updateConnectionStatus();
    
    window.addEventListener('online', () => {
      this.updateConnectionStatus();
      this.showConnectionNotification('online');
      syncPendingStories(storyDB);
    });

    window.addEventListener('offline', () => {
      this.updateConnectionStatus();
      this.showConnectionNotification('offline');
    });
  }

  updateConnectionStatus() {
    const statusDiv = document.getElementById('connection-status');
    const indicator = statusDiv?.querySelector('.status-indicator');
    const text = statusDiv?.querySelector('.status-text');
    
    if (navigator.onLine) {
      statusDiv?.classList.remove('offline');
      statusDiv?.classList.add('online');
      if (indicator) indicator.style.background = '#00E5A0';
      if (text) text.textContent = '🟢 Online';
    } else {
      statusDiv?.classList.remove('online');
      statusDiv?.classList.add('offline');
      if (indicator) indicator.style.background = '#FF5757';
      if (text) text.textContent = '🔴 Offline';
    }
  }

  showConnectionNotification(status) {
    const notification = document.createElement('div');
    notification.className = `connection-notification ${status}`;
    
    if (status === 'online') {
      notification.innerHTML = `
        <div class="notification-content">
          <span class="notification-icon">✅</span>
          <div>
            <strong>Back Online!</strong>
            <p>You're connected to the internet</p>
          </div>
        </div>
      `;
    } else {
      notification.innerHTML = `
        <div class="notification-content">
          <span class="notification-icon">⚠️</span>
          <div>
            <strong>You're Offline</strong>
            <p>Some features may be limited</p>
          </div>
        </div>
      `;
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  }

  async showFavorites() {
    try {
      const favorites = await storyDB.getFavorites();
      this.renderStoryList(favorites);
    } catch (error) {
      console.error('Failed to load favorites:', error);
    }
  }

  async initHomeMap(stories = null) {
    try {
      const mapContainer = document.getElementById('map');
      if (!mapContainer) {
        throw new Error('Map container not found');
      }

      if (window.currentMap) {
        window.currentMap.remove();
        window.currentMap = null;
      }

      mapContainer.innerHTML = '<div class="loading">Loading map...</div>';

      if (!stories) {
        stories = await api.getStories();
      }

      const map = L.map('map').setView([-2.5, 118], 5);
      window.currentMap = map;

      const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
      });

      const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri',
        maxZoom: 19
      });

      streetLayer.addTo(map);

      L.control.layers({
        "Street Map": streetLayer,
        "Satellite": satelliteLayer
      }).addTo(map);

      const defaultIcon = L.icon({
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        shadowSize: [41, 41]
      });

      const activeIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        shadowSize: [41, 41]
      });

      const bounds = [];
      const markers = [];
      
      stories.forEach((story, index) => {
        if (story.lat && story.lon) {
          try {
            const marker = L.marker([story.lat, story.lon], { icon: defaultIcon }).addTo(map);
            bounds.push([story.lat, story.lon]);
            
            marker.bindPopup(`
              <div class="popup-content">
                <img src="${story.photoUrl}" alt="${story.description}" style="max-width: 200px; height: auto;">
                <h4>${story.name}</h4>
                <p>${story.description}</p>
                <small>${new Date(story.createdAt).toLocaleDateString()}</small>
              </div>
            `);
            
            marker.storyId = story.id;
            marker.on('click', () => {
              this.highlightMarker(marker, markers, activeIcon, defaultIcon);
              this.scrollToStory(story.id);
            });
            
            markers.push(marker);
          } catch (error) {
            console.error(`❌ Failed to add marker for story ${story.id}:`, error);
          }
        }
      });

      if (bounds.length > 0) {
        try {
          map.fitBounds(bounds, { padding: [20, 20] });
        } catch (error) {
          console.error('❌ Failed to fit bounds:', error);
        }
      }

      this.renderStoryList(stories, map, markers, activeIcon, defaultIcon);
      this.setupLocationFilter(stories, map, markers, activeIcon, defaultIcon);

    } catch (error) {
      console.error('❌ Error initializing map:', error);
      const storyList = document.getElementById('story-list');
      if (storyList) {
        storyList.innerHTML = `
          <div class="message message-error">
            Failed to load map: ${error.message}
            <button onclick="router.loadStoriesDirectly()" class="btn btn-secondary" style="margin-top: 0.5rem;">Retry</button>
          </div>
        `;
      }
    }
  }

  highlightMarker(activeMarker, allMarkers, activeIcon, defaultIcon) {
    allMarkers.forEach(marker => marker.setIcon(defaultIcon));
    activeMarker.setIcon(activeIcon);
  }

  scrollToStory(storyId) {
    const card = document.querySelector(`[data-story-id="${storyId}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      card.classList.add('active');
      setTimeout(() => card.classList.remove('active'), 2000);
    }
  }

  renderStoryList(stories, map, markers, activeIcon, defaultIcon) {
    const storyList = document.getElementById('story-list');
    
    if (stories.length === 0) {
      storyList.innerHTML = '<p class="text-center">No stories available</p>';
      return;
    }
    
    storyList.innerHTML = stories.map(story => this.renderStoryCard(story)).join('');

    this.attachStoryCardListeners(stories, map, markers, activeIcon, defaultIcon);
  }

  renderStoryCard(story) {
    return `
      <article class="story-card" data-story-id="${story.id}" tabindex="0" role="button">
        <div class="story-image-wrapper">
          <img src="${story.photoUrl}" alt="Story photo: ${story.description}">
        </div>
        <div class="story-content">
          <h4>${story.name}</h4>
          <p>${story.description}</p>
          <div class="story-footer">
            <time datetime="${story.createdAt}">${new Date(story.createdAt).toLocaleDateString()}</time>
            <button class="btn-favorite" data-story-id="${story.id}">
              ⭐ Favorite
            </button>
          </div>
        </div>
      </article>
    `;
  }

  attachStoryCardListeners(stories, map, markers, activeIcon, defaultIcon) {
    document.querySelectorAll('.story-card').forEach(card => {
      const clickHandler = () => {
        const storyId = card.dataset.storyId;
        const story = stories.find(s => s.id === storyId);
        if (story && story.lat && story.lon) {
          map.setView([story.lat, story.lon], 13);
          const marker = markers.find(m => m.storyId === storyId);
          if (marker) {
            this.highlightMarker(marker, markers, activeIcon, defaultIcon);
            marker.openPopup();
          }
        }
      };

      card.addEventListener('click', (e) => {
        if (!e.target.classList.contains('btn-favorite')) {
          clickHandler();
        }
      });
      
      card.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          clickHandler();
        }
      });
    });
    
    document.querySelectorAll('.btn-favorite').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const storyId = btn.dataset.storyId;
        const story = stories.find(s => s.id === storyId);
        
        const isFav = await storyDB.isFavorite(storyId);
        if (isFav) {
          await storyDB.removeFavorite(storyId);
          btn.textContent = '⭐ Favorite';
          btn.style.background = 'var(--primary)';
        } else {
          await storyDB.addFavorite(story);
          btn.textContent = '⭐ Unfavorite';
          btn.style.background = 'var(--danger)';
        }
      });
      
      (async () => {
        const storyId = btn.dataset.storyId;
        const isFav = await storyDB.isFavorite(storyId);
        if (isFav) {
          btn.textContent = '⭐ Unfavorite';
          btn.style.background = 'var(--danger)';
        }
      })();
    });
  }

  setupLocationFilter(stories, map, markers, activeIcon, defaultIcon) {
    const filterSelect = document.getElementById('location-filter');
    const locations = [...new Set(stories.map(s => s.name))];
    
    locations.forEach(location => {
      const option = document.createElement('option');
      option.value = location;
      option.textContent = location;
      filterSelect.appendChild(option);
    });

    filterSelect.addEventListener('change', (e) => {
      const selected = e.target.value;
      
      if (selected === 'all') {
        markers.forEach(marker => marker.addTo(map));
        this.renderStoryList(stories, map, markers, activeIcon, defaultIcon);
      } else {
        const filtered = stories.filter(s => s.name === selected);
        markers.forEach(marker => marker.remove());
        
        const filteredMarkers = markers.filter(marker => {
          const story = stories.find(s => s.id === marker.storyId);
          return story && story.name === selected;
        });
        
        filteredMarkers.forEach(marker => marker.addTo(map));
        this.renderStoryList(filtered, map, filteredMarkers, activeIcon, defaultIcon);
      }
    });
  }

  renderAddStory() {
    if (!isAuthenticated()) {
      window.location.hash = '#login';
      return;
    }

    this.app.innerHTML = `
      <div class="add-story-container">
        <div class="form-container" style="max-width: 800px;">
          <h2>Add New Story</h2>
          <form id="add-story-form" novalidate>
            <div class="form-group">
              <label for="description">Story Description:</label>
              <textarea id="description" name="description" rows="4" required 
                        aria-describedby="description-error" 
                        placeholder="Tell us your story..."></textarea>
              <span id="description-error" class="error-text" role="alert"></span>
            </div>

            <div class="form-group">
              <label for="photo">Photo:</label>
              <div class="photo-controls">
                <input type="file" id="photo" name="photo" accept="image/*" required 
                       aria-describedby="photo-error">
                <button type="button" id="camera-btn" class="btn btn-secondary">Use Camera</button>
              </div>
              <span id="photo-error" class="error-text" role="alert"></span>
              
              <div id="camera-preview" class="hidden">
                <video id="camera-video" autoplay playsinline aria-label="Camera preview"></video>
                <button type="button" id="capture-btn" class="btn btn-secondary">Capture Photo</button>
                <button type="button" id="close-camera-btn" class="btn btn-secondary">Close Camera</button>
              </div>
              
              <div id="photo-preview" class="photo-preview"></div>
            </div>

            <div class="form-group">
              <label>Location (Click on map):</label>
              <div id="add-map" class="map-small" role="application" aria-label="Click to select location"></div>
              <div id="location-info" class="location-info">
                <strong>Selected:</strong> <span id="coords">No location selected</span>
              </div>
              <span id="location-error" class="error-text" role="alert"></span>
            </div>

            <button type="submit" class="btn btn-primary">Submit Story</button>
          </form>
          <div id="message" role="status" aria-live="polite"></div>
        </div>
      </div>
    `;

    this.initAddStoryMap();
  }

  initAddStoryMap() {
    let selectedLat = null;
    let selectedLon = null;
    let marker = null;
    let photoFile = null;
    let mediaStream = null;

    const markerIcon = L.icon({
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      shadowSize: [41, 41]
    });

    const map = L.map('add-map').setView([-2.5, 118], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      selectedLat = lat;
      selectedLon = lng;

      if (marker) map.removeLayer(marker);
      
      marker = L.marker([lat, lng], { icon: markerIcon }).addTo(map);

      document.getElementById('coords').textContent = 
        `Lat: ${lat.toFixed(6)}, Lon: ${lng.toFixed(6)}`;
      document.getElementById('location-error').textContent = '';
    });

    const form = document.getElementById('add-story-form');
    const descriptionInput = document.getElementById('description');
    const photoInput = document.getElementById('photo');
    const cameraBtn = document.getElementById('camera-btn');
    const cameraPreview = document.getElementById('camera-preview');
    const cameraVideo = document.getElementById('camera-video');
    const captureBtn = document.getElementById('capture-btn');
    const closeCameraBtn = document.getElementById('close-camera-btn');
    const photoPreview = document.getElementById('photo-preview');
    const messageDiv = document.getElementById('message');

    const validateDescription = () => {
      const description = descriptionInput.value.trim();
      const errorSpan = document.getElementById('description-error');
      if (!description) {
        errorSpan.textContent = 'Description is required';
        descriptionInput.setAttribute('aria-invalid', 'true');
        return false;
      }
      if (description.length < 10) {
        errorSpan.textContent = 'Description must be at least 10 characters';
        descriptionInput.setAttribute('aria-invalid', 'true');
        return false;
      }
      errorSpan.textContent = '';
      descriptionInput.setAttribute('aria-invalid', 'false');
      return true;
    };

    const validatePhoto = () => {
      const errorSpan = document.getElementById('photo-error');
      if (!photoFile) {
        errorSpan.textContent = 'Photo is required';
        return false;
      }
      if (photoFile.size > 1024 * 1024) {
        errorSpan.textContent = 'Photo size must be less than 1MB';
        return false;
      }
      if (!photoFile.type.startsWith('image/')) {
        errorSpan.textContent = 'Please select a valid image file';
        return false;
      }
      errorSpan.textContent = '';
      return true;
    };

    const validateLocation = () => {
      const errorSpan = document.getElementById('location-error');
      if (!selectedLat || !selectedLon) {
        errorSpan.textContent = 'Please select a location on the map';
        return false;
      }
      errorSpan.textContent = '';
      return true;
    };

    const previewPhoto = (file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        photoPreview.innerHTML = `<img src="${e.target.result}" alt="Photo preview">`;
      };
      reader.readAsDataURL(file);
      document.getElementById('photo-error').textContent = '';
    };

    photoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        photoFile = file;
        previewPhoto(file);
      }
    });

    cameraBtn.addEventListener('click', async () => {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        cameraVideo.srcObject = mediaStream;
        cameraPreview.classList.remove('hidden');
      } catch (error) {
        alert('Unable to access camera. Please use file upload instead.');
        console.error('Camera error:', error);
      }
    });

    captureBtn.addEventListener('click', () => {
      const canvas = document.createElement('canvas');
      canvas.width = cameraVideo.videoWidth;
      canvas.height = cameraVideo.videoHeight;
      canvas.getContext('2d').drawImage(cameraVideo, 0, 0);

      canvas.toBlob((blob) => {
        photoFile = new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
        previewPhoto(photoFile);
        closeCamera();
      }, 'image/jpeg', 0.8);
    });

    closeCameraBtn.addEventListener('click', closeCamera);

    function closeCamera() {
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
      }
      cameraVideo.srcObject = null;
      cameraPreview.classList.add('hidden');
    }

    descriptionInput.addEventListener('blur', validateDescription);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!validateDescription() || !validatePhoto() || !validateLocation()) {
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      try {
        if (!navigator.onLine) {
          await storyDB.addPendingStory({
            description: descriptionInput.value.trim(),
            photo: photoFile,
            lat: selectedLat,
            lon: selectedLon
          });
          
          messageDiv.className = 'message message-info';
          messageDiv.textContent = '🔴 Saved offline. Will sync when online.';
          
          setTimeout(() => window.location.hash = '#home', 1500);
          return;
        }
        
        await api.addStory(
          descriptionInput.value.trim(),
          photoFile,
          selectedLat,
          selectedLon
        );

        messageDiv.className = 'message message-success';
        messageDiv.textContent = '✅ Story added successfully! Redirecting...';
        
        setTimeout(() => window.location.hash = '#home', 1500);
      } catch (error) {
        messageDiv.className = 'message message-error';
        messageDiv.textContent = error.message;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Story';
      }
    });
  }
}

window.router = new Router();