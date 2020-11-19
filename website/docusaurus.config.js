module.exports = {
  title: 'Substrate Playground',
  tagline: 'Start hacking your substrate runtime in a web based VSCode like IDE',
  url: 'https://playground.substrate.dev',
  baseUrl: '/substrate-playground/',
  onBrokenLinks: 'throw',
  favicon: 'img/favicon.png',
  organizationName: 'paritytech',
  projectName: 'substrate-playground',
  themeConfig: {
    navbar: {
      title: 'Playground',
      logo: {
        alt: 'Parity Logo',
        src: 'img/favicon.png',
      },
      items: [
        {
          to: 'docs/',
          activeBasePath: 'docs',
          label: 'Docs',
          position: 'left',
        },
        {
          href: 'https://github.com/paritytech/substrate-playground',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Community',
          items: [
            {
              label: 'Stack Overflow',
              href: 'https://stackoverflow.com/questions/tagged/substrate',
            },
            {
              label: 'Element',
              href: 'https://app.element.io/#/room/#watercooler:matrix.parity.io',
            },
            {
              label: 'Twitter',
              href: 'https://twitter.com/ParityTech',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Blog',
              to: 'https://www.parity.io/blog/',
            },
            {
              label: 'Github',
              href: 'https://github.com/paritytech/substrate-playground',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Parity, Inc.`,
    },
  },
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          // Please change this to your repo.
          editUrl:
            'https://github.com/paritytech/substrate-playground/edit/master/website/',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      },
    ],
  ],
};
