import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';

import appCss from '../styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Thoughtline | Find the thought. Shape the words.' },
      {
        name: 'description',
        content:
          'Understand a selected LinkedIn conversation, explore reply directions, and shape writing in your own voice with Thoughtline.',
      },
      { property: 'og:title', content: 'Thoughtline | Find the thought. Shape the words.' },
      {
        property: 'og:description',
        content: 'A user-controlled Chrome side-panel extension for thoughtful LinkedIn writing.',
      },
      { name: 'theme-color', content: '#eef3f8' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/brand/thoughtline-mark.svg', type: 'image/svg+xml' },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
