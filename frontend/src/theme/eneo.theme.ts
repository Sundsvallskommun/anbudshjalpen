import {defineTheme} from '@astryxdesign/core/theme';

const focusRing = {
  outline: 'var(--focus-outline-width) var(--focus-outline-style) var(--focus-outline-color)',
  outlineOffset: 'var(--focus-outline-offset)',
};
// A menu's rows sit edge to edge in a clipping box: their ring is drawn inside them.
const rowFocusRing = {...focusRing, outlineOffset: 'calc(var(--focus-outline-width) * -1)'};
const TOUCH = '44px';

// Structural widths and bar heights of the frame (docs/design.md, "Ramen"). Widths are the one
// place raw px belongs; everything inside them uses the spacing scale. Bespoke CSS reads them as var(--layout-*).
// The workspace is inköp's review table (1 344 px): on that page the frame's content line follows it (app.css).
const LAYOUT_TOKENS = {
  '--layout-container': '1152px',
  '--layout-workspace': '1344px',
  '--layout-main': '760px',
  '--layout-rail': '360px',
  '--layout-form': '640px',
  '--height-top-nav': '64px',
  '--height-step-bar': '52px',
};
// The page's content line inside a full-width surface: at least the 16 px gutter, else centred on the container.
const CONTENT_INLINE = 'max(var(--spacing-4), calc((100% - var(--layout-container)) / 2))';
// The 2 px accent line under the chosen navigation item and the chosen step, instead of a grey pill.
const CHOSEN_LINE = 'inset 0 -2px 0 var(--color-accent)';

export const eneoTheme = defineTheme({
  name: 'eneo',
  color: {accent: ['#004595', '#52B1FF'], neutralStyle: 'neutral', contrast: 'standard'},
  typography: {
    scale: {base: 16, ratio: 1.2},
    body: {family: 'system-ui', fallbacks: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif'},
    code: {family: 'ui-monospace', fallbacks: '"SFMono-Regular", Consolas, monospace'},
  },
  tokens: {
    '--color-accent': ['#004595', '#52B1FF'],
    '--color-on-accent': ['#FFFFFF', '#0B1118'],
    // Astryx's default white label on the dark-mode error fill is 3.76:1; a dark label is 5.4:1.
    '--color-on-error': ['#FFFFFF', '#1A0A0C'],
    // The one action a screen exists for (Starta, Stoppa, Skapa dokument) is 48 px at every pointer; Astryx's
    // large control is 36 px with a mouse.
    '--size-element-lg': '48px',
    // Error text is 4.1:1 on the page's grey in Astryx's red, and that red is the recording dot's (1.0:1 and 1.25:1
    // apart): an error never looks like "recording". These are the module's own error colours from before the port.
    '--color-error': ['#AA181D', '#F47B7F'],
    // A control's edge is 2.8:1 on the page and on a muted fill in light mode; 3:1 is the floor (WCAG 1.4.11).
    '--color-border-emphasized': ['#85868F', '#626972'],
  },
  localTokens: LAYOUT_TOKENS,
  components: {
    // The page rests on the body grey and what the user acts on sits on white cards (direction.md, section 5): the
    // "section" shell paints its surface white everywhere, so its root takes the body colour and only the header
    // (demo strip and top bar, with the divider below) keeps the surface. The shell is as tall as the page instead of
    // a whole screen: the site's foot follows it outside the main region (ModuleShell), and on a short page it would
    // otherwise wait below the first screen. The page beyond it is the same body grey (app.css).
    'app-shell': {'variant:section': {backgroundColor: 'var(--color-background-body)', minHeight: 'auto'}},
    // The top bar follows the page container (1 152 px) and is 64 px high; its items reach the bar's lower edge so the
    // chosen item's accent line sits on it.
    'top-nav': {
      base: {
        minHeight: 'var(--height-top-nav)',
        paddingBlock: '0',
        paddingInline: CONTENT_INLINE,
      },
    },
    // The brand stands apart from the navigation: 16 px from the bar's own gap plus 24 px.
    'top-nav-heading': {base: {marginInlineEnd: 'var(--spacing-6)'}},
    // The chosen item has accent text in semibold and a 2 px accent line below, instead of a grey pill (the accent
    // means "you are here or can click"); hovering any item still tints it.
    'top-nav-item': {
      base: {
        minHeight: 'var(--height-top-nav)',
        borderRadius: '0',
        color: 'var(--color-text-primary)',
      },
      selected: {
        color: 'var(--color-text-accent)',
        fontWeight: 'var(--font-weight-semibold)',
        backgroundColor: 'transparent',
        boxShadow: CHOSEN_LINE,
      },
    },
    // A tab keeps no grey pressed background once it has been chosen: the accent line says it is chosen, and a
    // lingering tint after a tap read as a second state.
    tab: {
      selected: {
        '--color-overlay-hover': 'transparent',
        '--color-overlay-pressed': 'transparent',
      },
    },
    // The demo strip is the one full-width info banner: one neutral line on the surface with an edge below, not an
    // info-blue block (blue means clickable). Its content follows the page container.
    banner: {
      'container:section+status:info': {
        backgroundColor: 'var(--color-background-surface)',
        borderBlockEnd: '1px solid var(--color-border)',
        alignItems: 'center',
        paddingBlock: 'var(--spacing-1-5)',
        paddingInline: CONTENT_INLINE,
        minHeight: 'var(--spacing-9)',
      },
    },
    // Cards have 20 px padding (16 on a phone), a 1 px border and 12 px corners, and no shadow.
    card: {base: {padding: 'var(--spacing-5)'}},
    // A word with no break point (an e-mail address as a name, a long compound) wraps instead of reaching past a
    // 320 px screen: Astryx breaks words only when it truncates.
    // A phase's heading takes focus when its view appears (usePhaseHeading) but is no control: the browser counts that
    // focus call as keyboard focus and would frame the headline on every visit.
    heading: {base: {overflowWrap: 'anywhere', ':focus-visible': {outline: 'none'}}},
    text: {base: {overflowWrap: 'anywhere'}},
    'text-input': {base: {':focus-within': focusRing}},
    'text-area': {base: {':focus-within': focusRing}},
    'number-input': {base: {':focus-within': focusRing}},
    selector: {base: {':focus-within': focusRing}},
    typeahead: {base: {':focus-within': focusRing}},
    tokenizer: {base: {':focus-within': focusRing}},
    // The radio rows of a menu show no focus at all (a plain row tints, a radio row does not).
    'dropdown-menu-item': {base: {':focus-visible': rowFocusRing}},
    // A long compound word or e-mail address wraps inside its row instead of being cut off by it.
    item: {base: {overflowWrap: 'anywhere'}},
    // A removable chip: its remove button reaches a 44 px target through a pseudo-element, which the chip must not
    // clip, and its height gives way to the text spacing a reader may set (WCAG 1.4.12) instead of cutting the name.
    // The blue token is the brand's tint, not the data palette's blue: it follows the deployment's accent colour
    // (ORGANIZATION_ACCENT), with the primary text colour on it, which keeps its contrast whatever the accent is.
    token: {
      base: {overflow: 'visible', height: 'auto', minHeight: 'calc(var(--size-element-md) - 8px)'},
      'color:blue': {backgroundColor: 'var(--color-accent-muted)', color: 'var(--color-text-primary)'},
    },
    // The control is the slider's target (the track is 4 px, the thumb 20): the gate's 24 px, and 44 px below.
    'slider-control': {base: {minBlockSize: '24px'}},
    // A segmented control's track is the neutral tint. In dark mode, on a card, it lifts the surface so far that an
    // unselected label in the secondary colour is 4.3:1 (WCAG 1.4.3 asks 4.5). A fainter tint in dark mode keeps the
    // track visible and the label at 5:1; light mode keeps the design system's tint.
    'segmented-control': {
      base: {
        backgroundColor:
          'light-dark(var(--color-neutral), color-mix(in srgb, var(--color-text-primary) 15%, transparent))',
      },
    },
    // On a raised surface, such as the account menu's popover, the track is lighter still, and an unselected label in
    // the secondary colour falls to 3.8:1 in dark mode. Halfway between the secondary and the primary colour it is 5:1
    // there. Only unselected labels change: the selected one keeps the design system's colours, also in forced
    // colours, and light mode keeps them all.
    'segmented-control-item': {
      base: {
        ':not([data-selected="selected"])': {
          color:
            'light-dark(var(--color-text-secondary), color-mix(in srgb, var(--color-text-secondary) 50%, var(--color-text-primary)))',
        },
      },
    },
    // A row of chips wraps instead of reaching past a 320 px screen: the group is one inline line.
    'toggle-button-group': {base: {flexWrap: 'wrap'}},
    // A dialog opens on its title (the title takes focus, which gives it no outline): where focus is on it, as on
    // a keyboard's, its block shows the ring (WCAG 2.4.7).
    'dialog-header-title-block': {base: {':has(:focus-visible)': focusRing}},
    // A label longer than its line wraps and the button grows with it: the design system keeps one line, cuts the rest
    // off with an ellipsis and fixes the height (WCAG 1.4.10 reflow at 320 px, 1.4.4 resize at 200 %). The block padding
    // is small enough that a one-line label still fills the size's own height: 28, 32 and 36 px.
    button: {
      base: {whiteSpace: 'normal', height: 'auto', minHeight: 'var(--size-element-md)', paddingBlock: 'var(--spacing-0-5)'},
      'size:sm': {minHeight: 'var(--size-element-sm)'},
      'size:lg': {minHeight: 'var(--size-element-lg)'},
    },
    // The initials sit on a tint of the neutral colour; the secondary text colour on it, over the page's surface, is
    // 4.28:1 in dark mode, the primary one 8.5:1.
    'avatar-fallback': {base: {color: 'var(--color-text-primary)'}},
    // The trigger is one line of 13 px text, 19 px tall: the gate's 24 px (WCAG 2.5.8).
    'collapsible-trigger': {base: {minHeight: '24px'}},
    // The reader's own question in a thread is on the accent's tint (direction.md, section 4 "Steg 2 Fråga"), not the
    // neutral grey, with the corner toward the asker tucked in (radii 12 12 4 12, the end-end corner, so it
    // follows the reading direction) instead of the round chat radius. The answer is a card, so the assistant's
    // bubble keeps the default.
    'chat-message-bubble': {
      'sender:user+variant:filled': {
        backgroundColor: 'var(--color-accent-muted)',
        color: 'var(--color-text-primary)',
        borderRadius: 'var(--radius-container)',
        borderEndEndRadius: 'var(--radius-inner)',
      },
    },
  },
  adaptations: {
    rules: [
      {
        // A phone's top bar is 56 px with the main choices on a 44 px row below; the step bar is 48 px; cards pad 16 px;
        // the h1 steps down to 23 px.
        when: {width: {below: 'sm'}},
        value: {
          localTokens: {'--height-top-nav': '56px', '--height-step-bar': '48px'},
          components: {
            card: {base: {padding: 'var(--spacing-4)'}},
            // The page's h1 is 23/32 on a phone, so a long notice title leaves the steps on the first screen.
            heading: {'level:1': {fontSize: 'var(--font-size-xl)', lineHeight: 'var(--text-heading-2-leading)'}},
          },
        },
      },
      {
        when: {pointer: 'coarse'},
        value: {
          tokens: {'--size-element-sm': TOUCH, '--size-element-md': TOUCH, '--size-element-lg': '48px'},
          components: {
            'dropdown-menu-item': {base: {minHeight: TOUCH}},
            'selector-option-row': {base: {minHeight: TOUCH}},
            'typeahead-item': {base: {minHeight: TOUCH}},
            'top-nav-heading': {base: {minHeight: TOUCH}},
            'slider-control': {base: {minBlockSize: TOUCH}},
            'collapsible-trigger': {base: {minHeight: TOUCH}},
            'radio-list-item': {base: {minHeight: TOUCH}},
            // Menu rows (the account menu) and list rows are 44 px for a finger.
            item: {base: {minHeight: TOUCH}},
            // A token is a label, not a target: it keeps its 24 px height on a touch screen instead of following the
            // 44 px element size (a removable chip's remove button reaches 44 px through its own pseudo-element).
            token: {base: {minHeight: 'var(--spacing-6)'}},
          },
        },
      },
    ],
  },
});
