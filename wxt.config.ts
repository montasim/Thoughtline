import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

const linkedInOrigin = 'https://www.linkedin.com/*';
const providerOrigins = ['https://generativelanguage.googleapis.com/*', 'https://api.groq.com/*'];
const imageProviderOrigin = 'https://api.cloudflare.com/*';
const sourceOrigins = [
  'https://hacker-news.firebaseio.com/*',
  'https://dev.to/*',
  'https://medium.com/*',
  'https://lobste.rs/*',
  'https://api.stackexchange.com/*',
];

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'Thoughtline',
    short_name: 'Thoughtline',
    description: 'Find the thought. Shape the words.',
    minimum_chrome_version: '120',
    permissions: ['contextMenus', 'scripting', 'sidePanel', 'storage'],
    // Chrome supports unlimitedStorage as optional even though WXT's shared manifest type omits it.
    optional_permissions: ['unlimitedStorage'] as never[],
    optional_host_permissions: [
      linkedInOrigin,
      ...providerOrigins,
      imageProviderOrigin,
      ...sourceOrigins,
    ],
    action: {
      default_title: 'Open Thoughtline',
      default_icon: {
        16: 'icon/icon-16.png',
        32: 'icon/icon-32.png',
        48: 'icon/icon-48.png',
        128: 'icon/icon-128.png',
      },
    },
    icons: {
      16: 'icon/icon-16.png',
      32: 'icon/icon-32.png',
      48: 'icon/icon-48.png',
      128: 'icon/icon-128.png',
    },
    incognito: 'split',
  },
});
