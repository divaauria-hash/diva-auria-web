import { getToken } from './api.js';

export class PushNotificationManager {
  constructor() {
    this.isSubscribed = false;
    this.subscription = null;
    this.VAPID_PUBLIC_KEY = 'BCCs2eonMI-6H2ctvFaWg-UYdDv387Vno_bzUzALpB442r2lCnsHmtrx8biyPi_E-1fSGABK_Qs_GlvPoJJqxbk';
  }

  async init() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('Push notifications not supported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      this.subscription = await registration.pushManager.getSubscription();
      this.isSubscribed = !(this.subscription === null);
      
      console.log('Push Manager initialized. Subscribed:', this.isSubscribed);
      this.updateUI();
    } catch (error) {
      console.error('Push init failed:', error);
    }
  }

  async subscribe() {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }

      const registration = await navigator.serviceWorker.ready;
   
      this.subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.VAPID_PUBLIC_KEY)
      });

      console.log('Push subscription:', this.subscription);

      await this.sendSubscriptionToServer(this.subscription);
      
      this.isSubscribed = true;
      this.updateUI();

      await this.showTestNotification();
      
      alert('✅ Push notifications enabled successfully!');
    } catch (error) {
      console.error('Subscribe failed:', error);
      alert('Failed to subscribe: ' + error.message);
    }
  }

  async unsubscribe() {
    try {
      if (!this.subscription) {
        console.log('No subscription to unsubscribe');
        return;
      }

      await this.removeSubscriptionFromServer();

      await this.subscription.unsubscribe();
      
      this.subscription = null;
      this.isSubscribed = false;
      this.updateUI();
      
      alert('✅ Push notifications disabled!');
    } catch (error) {
      console.error('Unsubscribe failed:', error);
      alert('Failed to unsubscribe: ' + error.message);
    }
  }

  async sendSubscriptionToServer(subscription) {
    const token = getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      const subscriptionData = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))),
          auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth'))))
        }
      };

      console.log('Sending subscription to server:', subscriptionData);

      const response = await fetch('https://story-api.dicoding.dev/v1/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(subscriptionData)
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to save subscription');
      }

      console.log('Subscription saved to server:', data);
    } catch (error) {
      console.error('Failed to save subscription:', error);
      throw error;
    }
  }

  async removeSubscriptionFromServer() {
    const token = getToken();
    if (!token || !this.subscription) {
      return;
    }

    try {
      const response = await fetch('https://story-api.dicoding.dev/v1/notifications/subscribe', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          endpoint: this.subscription.endpoint
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to remove subscription');
      }

      console.log('Subscription removed from server');
    } catch (error) {
      console.error('Failed to remove subscription:', error);
    }
  }

  async showTestNotification() {
    try {
      const registration = await navigator.serviceWorker.ready;
      
      await registration.showNotification('Test Notification', {
        body: 'Push notifications are now enabled! You will receive updates when new stories are added.',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        vibrate: [200, 100, 200],
        tag: 'test-notification'
      });
      
      console.log('Test notification shown');
    } catch (error) {
      console.error('Failed to show test notification:', error);
    }
  }

  updateUI() {
    const toggle = document.getElementById('notification-toggle');
    if (toggle) {
      toggle.checked = this.isSubscribed;
      toggle.disabled = false;
    }
  }

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  showNotification(title, message) {
    if (Notification.permission === 'granted') {
      new Notification(title, { body: message, icon: '/icon-192x192.png' });
    }
  }
}