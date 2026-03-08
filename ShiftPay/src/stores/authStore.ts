import { defineStore } from 'pinia';
import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
  type Configuration
} from '@azure/msal-browser';

const scopes = ['https://shiftpay.onmicrosoft.com/api/access_as_user', 'openid', 'offline_access'];

const ENCRYPTION_COOKIE_NAME = 'msal.cache.encryption';
const ENCRYPTION_COOKIE_BACKUP_KEY = 'msal.cache.encryption.backup';

const msalConfig: Configuration = {
  auth: {
    clientId: '37cdd807-8536-47d3-a393-c455fd68e5f1',
    authority: 'https://shiftpay.b2clogin.com/shiftpay.onmicrosoft.com/B2C_1_signup_signin',
    knownAuthorities: ['shiftpay.b2clogin.com'],
    redirectUri: window.location.origin
  },
  cache: {
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false
  }
};

export const useAuthStore = defineStore('auth', {
  state: () => ({
    msalInstance: null as PublicClientApplication | null,
    account: null as AccountInfo | null,
    accessToken: '' as string
  }),

  actions: {
    async init() {
      // MSAL v4 encrypts token cache using a key stored in a session cookie
      // (msal.cache.encryption). Session cookies are cleared when the browser
      // closes, causing all encrypted cache entries (social account tokens) to
      // be unreadable and deleted on next init. Workaround: persist the cookie
      // value in localStorage and restore it before MSAL initializes.
      const existingCookie = document.cookie.split('; ').find((c) => c.startsWith(`${ENCRYPTION_COOKIE_NAME}=`));

      if (!existingCookie) {
        // Cookie is gone (browser was closed) — restore from localStorage backup
        const backup = localStorage.getItem(ENCRYPTION_COOKIE_BACKUP_KEY);
        if (backup) {
          document.cookie = `${ENCRYPTION_COOKIE_NAME}=${backup}; SameSite=None; Secure`;
        }
      }

      this.msalInstance = new PublicClientApplication(msalConfig);
      await this.msalInstance.initialize();

      // Back up the encryption cookie after init (it's created during init if new)
      const cookieAfterInit = document.cookie.split('; ').find((c) => c.startsWith(`${ENCRYPTION_COOKIE_NAME}=`));
      if (cookieAfterInit) {
        const cookieValue = cookieAfterInit.substring(ENCRYPTION_COOKIE_NAME.length + 1);
        localStorage.setItem(ENCRYPTION_COOKIE_BACKUP_KEY, cookieValue);
      }

      const currentAccounts = this.msalInstance.getAllAccounts();

      if (currentAccounts.length > 0) {
        this.account = currentAccounts[0];
        this.msalInstance.setActiveAccount(this.account);
        console.log('Account restored');
      }
    },

    async login() {
      if (!this.msalInstance) await this.init();

      const loginResponse = await this.msalInstance!.loginPopup({
        scopes: scopes
      });

      this.account = loginResponse.account!;
      this.msalInstance!.setActiveAccount(this.account);

      console.log('Login successful');
    },

    async fetchToken() {
      if (!this.msalInstance || !this.account) throw new Error('Not logged in');

      try {
        const result = await this.msalInstance.acquireTokenSilent({
          account: this.account,
          scopes: scopes
        });

        this.accessToken = result.accessToken;
        console.log('Token fetched successfully');
        return this.accessToken;
      } catch (error) {
        // Refresh token expired or interaction required — prompt user to re-authenticate
        if (error instanceof InteractionRequiredAuthError) {
          const result = await this.msalInstance.acquireTokenPopup({
            account: this.account,
            scopes: scopes
          });

          this.account = result.account!;
          this.msalInstance.setActiveAccount(this.account);
          this.accessToken = result.accessToken;
          console.log('Token fetched via interactive prompt');
          return this.accessToken;
        }
        throw error;
      }
    },

    async logout() {
      await this.msalInstance?.logoutPopup();
      this.account = null;
      this.accessToken = '';
      localStorage.removeItem(ENCRYPTION_COOKIE_BACKUP_KEY);
    }
  },

  getters: {
    isAuthenticated(): boolean {
      return !!this.account;
    }
  }
});
