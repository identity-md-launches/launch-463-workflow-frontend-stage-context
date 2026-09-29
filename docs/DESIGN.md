# COMP interface design

This document describes the implemented source in `web/src/`, rather than a proposed design. It is intentionally stored at `docs/DESIGN.md`: the assignment requests a root `DESIGN.md` but its overriding write budget permits only `web/**`, `dist/**`, and `docs/**`. No root file was created.

## Overview

COMP is a Sepolia borrowing workspace for test wallets using IMD collateral and consumable oracle minting rights. The requested dark, minimal presentation uses a single page, restrained green-gray surfaces, a lime primary action, and explicitly labeled position health. Balances lead the page; position context appears before its related form in DOM order. Contract details and precise balances use native disclosures.

The reusable source of truth is [styles.css](../web/src/styles.css); [App.tsx](../web/src/App.tsx) defines page composition and local components. Vite, React, TypeScript, and plain CSS are used without a UI framework. The visual brand is COMP / Compute Money; CPL is identified separately in protocol details. All artwork is the small local [mark.svg](../web/public/mark.svg); there are no remote fonts or image services.

## Colors

Colors use exact hex primitives with semantic aliases in `styles.css:1`. The application deliberately ships one dark appearance and exposes no theme switch.

| Semantic token | Value | Role |
| --- | --- | --- |
| `--bg` | `#101312` | Page and amount-field background |
| `--surface` | `#181c1a` | Balance cards, action panel, notices |
| `--surface-raised` | `#1e2420` | Neutral buttons, selected action, token chips |
| `--text` | `#eef3ee` | Main copy, values, selected control border |
| `--muted` | `#aab6ae` | Supporting copy, labels, inactive navigation |
| `--border` | `#39453c` | Structural separators and card outlines |
| `--control-border` | `#77877b` | Button and input boundaries |
| `--accent`, `--focus` | `#c0ef80` | Primary button, focus perimeter, navigation marker |
| `--accent-hover` | `#d0f4a1` | Primary hover fill |
| `--on-accent` | `#18220e` | Text on the primary action and skip link |
| `--healthy` | `#85dcac` | Healthy position, at least 170% CR |
| `--caution` | `#edc779` | 150–169% CR and network notice |
| `--danger` | `#ffa3a3` | Below 150% CR and actionable errors |

Placeholder text uses `--neutral-500` (`#829087`). Health colors always accompany a label and numeric ratio; a debt-free position reads “No debt.” Control boundaries deliberately use a stronger token than card separators. Contrast measurements and their limits are recorded in [INTERFACE_REVIEW.md](INTERFACE_REVIEW.md).

## Typography

The body stack is `'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif`; the monospace stack is `'SFMono-Regular', Consolas, 'Liberation Mono', monospace`. A decorative IMD chip alone uses Georgia italic. No font binaries are loaded; the available system font determines the actual face. CSS requests weights 400, 500, 600, and 700 with `font-synthesis: none`; exact system-font weight availability is not asserted.

The root is 16px with unitless 1.6 line height. Named tokens are `--text-small: .8125rem`, `--text-body: .9375rem`, and `--text-section: 1.125rem`. The main heading uses `clamp(2rem, 3.1vw, 2.75rem)`, weight 500, line height 1.2, and negative tracking. Section headings use 1.125rem/600; instruction headings use 1rem/600. The explanatory section heading is 1.25rem/500. Headings balance wrapping and paragraphs use `text-wrap: pretty`.

Balances use 1.875rem type, collateral/debt 1.75rem, and the main ratio 3.25rem. Dynamic amounts use tabular numerals and wrapping rather than ellipsis. Summary balances show at most four fractional digits; “View exact balances” exposes all meaningful on-chain decimals in selectable text. Full addresses wrap in the protocol disclosure and have explicit Copy controls. Amount input type is 1.75rem; admin fields are 1rem, keeping input text at least 16px on mobile.

Small uppercase eyebrow and testnet labels are presentation styles, not form labels. The smallest health-legend text is redundant with the larger numeric ratio and named status. Long explanations have local measures (intro 470px; instructional paragraphs 32ch, increasing to 50ch on mobile).

## Layout

`.container` caps the page at 1168px including 1.5rem inline padding. Shared gaps mostly use .5rem, .75rem, 1rem, 1.5rem, and 3rem. Three balance cards lead into `.workspace`, a two-column `1.12fr 1fr` grid. The position appears first and the transaction form second. Panel corners and padding are shared; numbers and labels align to panel edges. All primary actions stay in normal document flow.

| Breakpoint | Implemented adaptation |
| --- | --- |
| Above 62rem | Full header, 1.75rem panel padding, two-column workspace |
| At most 62rem | More compact header/gaps and 1.25rem panel padding |
| At most 48rem | Header navigation wraps; workspace and admin form become single-column; duplicate desktop testnet note hides |
| At most 34rem | 1rem page inset; balance cards become compact rows; instruction steps stack; notices/footer stack; wallet address and visible Disconnect label form a column |

The root has `min-width: 280px`; the reviewed minimum is 320 CSS pixels. `minmax(0, 1fr)`, `min-width: 0`, and address/value wrapping prevent normal content from forcing tracks wider. Logical spacing properties preserve the intended reading order. The page is English-only; no translated or RTL variant is claimed. Browser evidence covers 320, 390, 768, and 1440 CSS-pixel widths, including the production export under a gateway-style subpath. Native 200% browser zoom remains unverified.

## Elevation & depth

The interface is deliberately flat: opaque tonal surfaces and 1px borders group content. No floating overlays, blurred backdrops, or card shadows are used. The health indicator alone has a 2px page-colored shadow to separate its marker from the bar. The focused skip link sits above content at `z-index: 20`.

## Shapes

Cards and large panels use 12px corners; buttons, fields, notices, and transaction status use 8px; admin fields use 6px; small badges use 4px. Token chips, status dots, and the spinner are circular. The health strip uses 2px rounding. Reuse these existing shapes by role rather than adding a new corner system.

## Components

| Component or pattern | Source | Behavior and reuse |
| --- | --- | --- |
| `Icon({name})` | `App.tsx:8` | Local 20px SVGs, 1.5px strokes, `currentColor`; decorative and hidden from assistive technology |
| `Token({symbol})` | `App.tsx:12` | Decorative IMD, COMP, and rights markers; visible adjacent text supplies meaning |
| `AddressLink({address, explorer, label})` | `App.tsx:13` | Full explorer-linked address, named copy button, readable clipboard failure fallback |
| `button`, `.primary`, `.text-button`, `.icon-button` | `styles.css:22` | Neutral controls, one lime primary form action, underlined utility actions, named refresh control; minimum 44px button height |
| `.action-selector` | `styles.css:89` | Four native buttons in a labeled group; `aria-pressed` identifies the active action; no unsupported custom tab semantics |
| `.amount-field`, `.preview` | `styles.css:95` | Labeled decimal input, available amount, exact max, projected CR and rights; linked inline error and focus on invalid submission |
| `.balance-card`, `.position-panel` | `styles.css:61` | Live balances and position, explicit disconnected/loading states, named health, block number, refresh action |
| `.transaction-status` | `styles.css:112` | Persistent polite status, action name, receipt state and explorer link; uncertain confirmation retains a recovery control |
| `.admin-panel` | `styles.css:114` | Only visible to the oracle's on-chain deployer; separately labeled/validated recipient and rights fields |
| Native `details` | `App.tsx` | Exact-balance and protocol disclosures are keyboard and touch operable; full addresses and assumptions remain reachable |

Every transaction is unavailable until deployment, network, wallet, and fresh-read prerequisites pass. Approval and deposit are separate steps. A shared transaction lock prevents conflicting submissions while the active action keeps its own visible name/status. Pending control states persist through receipt handling and refreshed reads. Repayment explicitly needs no approval and does not restore rights.

Focus uses a 2px lime perimeter with a 4px offset (2px for inputs); forced colors uses `Highlight`. Hover styles apply only where hover is supported. Motion is confined to the no-reduced-motion media query: 150ms color/border/scale feedback, scale `.96` on press, and a 1s spinner. Labels carry status even with animation disabled.

## Do's and don'ts

- Start another surface inside `.container`; reuse panel padding, token aliases, form labels, and native controls.
- Use `.primary` for the current flow's next action; keep sibling action choices neutral and show their selected state with `aria-pressed`.
- Use `--control-border` for interactive boundaries and `--border` for structural separators.
- Pair status color with plain text. Preserve full values through a native disclosure whenever a summary shortens them.
- Keep addresses, ABI paths, chain, and public RPCs sourced from the runtime deployment loader. Design copy must not imply USD pricing or production stability.
- Add a page by composing the existing heading, panel, field, preview, status, and disclosure patterns, then check its natural DOM order, 320px reflow, keyboard flow, and production-subpath asset loading.

Review coverage and unperformed checks are in [INTERFACE_REVIEW.md](INTERFACE_REVIEW.md). Guidance provenance and licenses are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
