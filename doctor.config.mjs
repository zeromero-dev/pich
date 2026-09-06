// React Doctor (`npx react-doctor@latest`) runs before every build.
// Only deliberate, documented exceptions belong here — fix everything else.
const config = {
  rules: {
    // Plain <img> is a decision (CLAUDE.md, Key Gotchas): on the Vercel Hobby
    // plan next/image returns 402 past the quota and the artwork disappears.
    'react-doctor/nextjs-no-img-element': 'off',
    // The project uses npm (package-lock.json). The pnpm lockfile the scan
    // writes is its own artifact, so pnpm hardening does not apply.
    'react-doctor/require-pnpm-hardening': 'off',
  },
}

export default config
