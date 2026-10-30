# The JDAnkney Vault

Hardware and software projects by [jdankney](https://github.com/jdankney) — a
Computer Engineering student at Palomar College transferring to UC San Diego.
Build notes, parts lists, and the things that went wrong along the way.

Live at **[jdankney.dev](https://jdankney.dev)**,
built with [Astro](https://astro.build) and deployed to Cloudflare from this repo.

This is my personal site, so I'm not accepting pull requests or issues. You're
welcome to fork it or reuse the code under the [license](#license) below.

## Project structure

```text
├── public/                  static assets served as-is (favicons)
├── src/
│   ├── assets/
│   │   ├── fonts/           Atkinson (body) + MINECRAFT-PE (display)
│   │   ├── media/           images used inside project write-ups
│   │   └── me.jpg           homepage portrait
│   ├── components/          Header, Footer, ProjectLog, FastFetch, BaseHead, icons,
│   │                        RippleBoard (ripple canvas), MountedPortrait (homepage J1 photo)
│   ├── content/projects/    the project write-ups themselves (Markdown)
│   ├── layouts/
│   │   ├── PageLayout.astro   standalone pages (About)
│   │   └── ProjectPost.astro  individual project write-ups
│   ├── pages/               routes — /, /about, /projects, /rss.xml, /404
│   ├── ripple/              the RF ripple engine: WebGL2 wave sim, PCB board, mesh relays
│   ├── styles/global.css    design tokens + shared utilities
│   └── content.config.ts    frontmatter schema for the projects collection
├── scripts/smoke.mjs        headless smoke test for the ripple boards
├── astro.config.mjs
└── package.json
```

Write-ups live in `src/content/projects/`, **not** under `src/pages/` — that
keeps them content rather than routes, so each one publishes exactly once
(at `/projects/<slug>/`) instead of twice.

## Adding a project

Drop a new Markdown file in `src/content/projects/`. Frontmatter:

| Field         | Required | Notes                                              |
| :------------ | :------- | :------------------------------------------------- |
| `title`       | yes      |                                                     |
| `description` | yes      | one line; shown in the project log and meta tags    |
| `pubDate`     | yes      | e.g. `'Jun 12 2026'`                                |
| `status`      | no       | `complete` \| `in-progress` \| `shelved`            |
| `tags`        | no       | e.g. `['ESP32-C3', 'BLE']`                          |
| `difficulty`  | no       | 1–5                                                 |
| `cost`        | no       | e.g. `'~$5 ($2.60 ESP32-C3 \| $2.57 10x IRLZ44N)'`  |
| `repo`        | no       | link to source                                      |
| `heroImage`   | no       | image import path                                   |

`status: 'in-progress'` also drives the "on the bench" line on the homepage.

## The ripple board

Every navy page sits on a PCB that `src/ripple/` draws from a seed, with a
WebGL2 wave simulation on top. The homepage hero always runs; everywhere else
the water stays still until you hover, tab, click, or arrive from a link. Each
project's board is seeded from its slug and silkscreened with its first three
tags. Reduced-motion visitors and browsers without WebGL2 get the board as a
still image.

To change the homepage photo, replace `src/assets/me.jpg`. If the crop is off,
adjust `focus` on `<MountedPortrait>` in `src/pages/index.astro`.

`npm run smoke` needs a Chromium: run `npx playwright install chromium` once,
or point it at a system one with `CHROMIUM_PATH=/usr/bin/chromium`.

## Commands

| Command                  | Action                                     |
| :----------------------- | :----------------------------------------- |
| `npm install`            | Install dependencies                        |
| `npm run dev`            | Dev server at `localhost:4321`              |
| `npm run dev -- --host`  | Dev server exposed on the local network     |
| `npm run build`          | Build the production site to `./dist/`      |
| `npm run preview`        | Preview the production build locally        |
| `npm test`               | Unit tests (Vitest)                         |
| `npm run check`          | Type-check (`astro check`)                  |
| `npm run smoke`          | Headless smoke test of the built site       |

## Credit

Started from the [Astro blog starter](https://github.com/withastro/astro/tree/main/examples/blog);
the base typography owes a debt to [Bear Blog](https://github.com/HermanMartinus/bearblog/).
Everything else — the design system, layout, and writing — is mine.

## License

- **Code** (components, layouts, pages, styles, scripts, and config) is under the [MIT License](LICENSE).
- **Writing and media** (the write-ups in `src/content/`, plus the photos and
  images in `src/assets/`, including `me.jpg`) are © James Ankney, all rights
  reserved. Please don't republish them.
- **Fonts** in `src/assets/fonts/` are third-party and keep their own licenses
  (Atkinson Hyperlegible is under the SIL Open Font License 1.1).
