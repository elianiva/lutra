import { renderChromaticAberration } from "./bodies/chromatic-aberration";
import { renderClarity } from "./bodies/clarity";
import { renderContrast } from "./bodies/contrast";
import { renderExposure } from "./bodies/exposure";
import { renderGrain } from "./bodies/grain";
import { renderHighlights } from "./bodies/highlights";
import { renderSaturation } from "./bodies/saturation";
import { renderShadows } from "./bodies/shadows";
import { renderVignette } from "./bodies/vignette";
import { renderWhiteBalance } from "./bodies/white-balance";
import { formatEV, formatPercent, formatSigned, type LayerEntry } from "./format";

// Adding a new adjustment layer = adding one entry below. The Layer / Patch /
// SVs types, the params UI, the createLayer/createSVs factories, and the
// Add panel grid all derive from this map. `as const satisfies` gives us
// narrow literal types so the derived unions keep their per-entry
// precision. The body renderer emits the SkSL for that layer; the chain
// source generator inlines all active bodies into one RuntimeEffect.
export const layerRegistry = {
  exposure: {
    body: renderExposure,
    label: "Exposure",
    fields: {
      stops: {
        default: 0,
        min: -3,
        max: 3,
        label: "EXPOSURE",
        format: "ev",
        majorTicks: [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3],
      },
    },
    formatValue: (l) => formatEV(l.stops),
  },
  contrast: {
    body: renderContrast,
    label: "Contrast",
    fields: {
      amount: {
        default: 0,
        min: -1,
        max: 1,
        label: "CONTRAST",
        format: "signed",
        majorTicks: [-1, -0.5, 0, 0.5, 1],
      },
    },
    formatValue: (l) => formatSigned(l.amount),
  },
  shadows: {
    body: renderShadows,
    label: "Shadows",
    fields: {
      amount: {
        default: 0,
        min: -1,
        max: 1,
        label: "SHADOWS",
        format: "signed",
        majorTicks: [-1, -0.5, 0, 0.5, 1],
      },
    },
    formatValue: (l) => formatSigned(l.amount),
  },
  highlights: {
    body: renderHighlights,
    label: "Highlights",
    fields: {
      amount: {
        default: 0,
        min: -1,
        max: 1,
        label: "HIGHLIGHTS",
        format: "signed",
        majorTicks: [-1, -0.5, 0, 0.5, 1],
      },
    },
    formatValue: (l) => formatSigned(l.amount),
  },
  whiteBalance: {
    body: renderWhiteBalance,
    label: "White Balance",
    toggled: true,
    fields: {
      temp: {
        default: 0,
        min: -1,
        max: 1,
        label: "TEMPERATURE",
        majorTicks: [-1, -0.5, 0, 0.5, 1],
        format: (v) => {
          const k =
            v < 0 ? Math.round(6500 - (1 + v) * 4500) : Math.round(6500 + v * 5500);
          return `${k} K`;
        },
      },
      tint: {
        default: 0,
        min: -1,
        max: 1,
        label: "TINT",
        format: "signed",
        majorTicks: [-1, -0.5, 0, 0.5, 1],
      },
    },
    formatValue: (l) => {
      const k =
        l.temp < 0
          ? Math.round(6500 - (1 + l.temp) * 4500)
          : Math.round(6500 + l.temp * 5500);
      return `${k} K · ${formatSigned(l.tint)}`;
    },
  },
  saturation: {
    body: renderSaturation,
    label: "Saturation",
    fields: {
      amount: {
        default: 0,
        min: -1,
        max: 1,
        label: "SATURATION",
        format: "signed",
        majorTicks: [-1, -0.5, 0, 0.5, 1],
      },
    },
    formatValue: (l) => formatSigned(l.amount),
  },
  grain: {
    body: renderGrain,
    label: "Grain",
    fields: {
      amount: {
        default: 0,
        min: 0,
        max: 1,
        label: "GRAIN",
        format: "percent",
        majorTicks: [0, 0.25, 0.5, 0.75, 1],
      },
    },
    formatValue: (l) => formatPercent(l.amount),
  },
  vignette: {
    body: renderVignette,
    label: "Vignette",
    toggled: true,
    fields: {
      amount: {
        default: 0,
        min: -1,
        max: 1,
        label: "VIGNETTE",
        format: "signed",
        majorTicks: [-1, -0.5, 0, 0.5, 1],
      },
      size: {
        default: 0.6,
        min: 0.2,
        max: 1,
        label: "SIZE",
        format: "percent",
        majorTicks: [0.2, 0.4, 0.6, 0.8, 1],
      },
    },
    formatValue: (l) => `A ${formatSigned(l.amount)} · ${formatPercent(l.size)}`,
  },
  chromaticAberration: {
    body: renderChromaticAberration,
    label: "Chromatic Aberration",
    fields: {
      amount: {
        default: 0,
        min: -1,
        max: 1,
        label: "CHROMATIC ABERRATION",
        format: "signed",
        majorTicks: [-1, -0.5, 0, 0.5, 1],
      },
    },
    formatValue: (l) => formatSigned(l.amount),
  },
  clarity: {
    body: renderClarity,
    label: "Clarity",
    fields: {
      amount: {
        default: 0,
        min: -1,
        max: 1,
        label: "CLARITY",
        format: "signed",
        majorTicks: [-1, -0.5, 0, 0.5, 1],
      },
    },
    formatValue: (l) => formatSigned(l.amount),
  },
} as const satisfies Record<string, LayerEntry>;

export type LayerRegistry = typeof layerRegistry;
export type LayerType = keyof LayerRegistry;
