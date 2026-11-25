# Pujari Vanaja Sudha — Portfolio

A responsive React portfolio showcasing applied AI, full-stack applications and backend projects from https://github.com/vanajasudha.

## Development

- Install dependencies: `npm install`
- Start locally: `npm run dev`
- Build for production: `npm run build`
- Preview the production build: `npm run preview`

On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

## Content

Project data and profile links are in `src/main.jsx`. Visual styles and responsive layouts are in `src/styles.css`. Page metadata is in `index.html`.

Featured project descriptions and technology lists were checked against the public repository READMEs on November 25, 2026. AI Mentor is identified as a team project. VLM-Edge is identified as a research prototype with live GPU evaluation pending. Architecture illustrations are conceptual diagrams, not product screenshots. The TaskFlow live-site URL is supplied by its GitHub repository; deployed application functionality was not tested.

Contact links use 24bds059@iiitdwd.ac.in, LinkedIn and GitHub. The resume download serves the original supplied DOCX, whose original contact details are retained. Education and hackathon recognition are included; work experience entries are omitted.

## Validation

`npm.cmd run build` passes. Installed Chrome and Edge each passed 22 viewport checks from 280px to 2560px (44 total), including short landscape screens and mobile touch emulation. Checks covered overflow, element bounds, 44px touch targets, all project filters, menu touch activation, Escape dismissal and focus, closing after navigation, section anchors, the email link and the served DOCX download. Both browsers loaded the Manrope font and reported no JavaScript runtime errors. Phone and desktop screenshots were visually reviewed.

Run `node scripts/verify-responsive.cjs` after building to repeat the checks using installed Chrome and Edge on Windows. Results and screenshots are saved under `verification/`; the machine-readable result is `verification/report.json`. The script uses temporary isolated browser profiles and closes its browser processes and local server on completion.

Safari, Firefox and physical-device testing remain unverified because those environments are unavailable. Emulation does not establish real iOS/Android compatibility. External project applications and email delivery are outside these checks.

The production output is in `dist/` and can be served by a static hosting provider. These changes have not been published.
