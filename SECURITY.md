# Security Policy

## Supported Versions

Only the latest release receives security fixes. We do not backport patches to older versions.

## Reporting a Vulnerability

**Do not open a public issue for security bugs.**

Use GitHub's private vulnerability reporting:

1. Go to the [Security tab](../../security) of this repository
2. Click "Report a vulnerability"
3. Provide a clear description, reproduction steps, and impact assessment

If you cannot use GitHub's reporting, email security concerns to the repository maintainers directly.

## Response Timeline

| Stage | Target |
|-------|--------|
| Acknowledge report | 48 hours |
| Triage and severity assessment | 7 days |
| Patch for critical issues | 30 days |
| Patch for non-critical issues | 90 days |

We will keep you informed of progress throughout the process.

## Out of Scope

The following are **not** considered security vulnerabilities:

- Rate limiting behavior on faucet.sh (testnet faucet is intentionally open with per-address limits)
- Known limitations of the x402 payment protocol itself (report these to [x402](https://github.com/coinbase/x402))
- Denial-of-service via high request volume (this is an operational concern, not a vulnerability)
- Issues requiring physical access to the server
- Social engineering attacks
- Spam or abuse of free-tier endpoints

## Disclosure Policy

We follow coordinated disclosure:

1. Reporter submits privately
2. We confirm, triage, and develop a fix
3. We release the patch and publish an advisory
4. Reporter is credited in the release notes (unless they prefer anonymity)

Please allow us reasonable time to address the issue before any public disclosure.
