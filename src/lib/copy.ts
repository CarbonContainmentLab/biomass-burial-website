/**
 * Every user-facing string in the app.
 *
 * Components do not inline sentences (03 §14). Two rules only work if the
 * strings live in one file:
 *
 *   1. "Straight-line distance" everywhere; the word "network" appears nowhere.
 *      Grep this file and you have audited the whole app.
 *   2. Money is USD per tonne CO2e, never "$/dry ton".
 *
 * Number formatting is `lib/format.ts`'s job, not this file's. Where a string
 * needs a value it takes an already-formatted string.
 */

export const COPY = {
  /* ---- Chrome ---------------------------------------------------------- */
  brandOrg: 'Carbon Containment Lab',
  brandTitle: 'Biomass Burial Siting Tool',
  /* Rendered smaller and in secondary ink beside the title, not as part of it. */
  brandVersion: 'v1.0',
  paperLink: 'Source Paper',
  tourOpen: 'Tutorial',
  tourClose: 'Close',
  tourNext: 'Next',
  tourBack: 'Back',
  tourDone: 'Done',
  tourStepOf: (n: number, total: number) => `${n} of ${total}`,
  /**
   * One sentence each. The tour points at things that are already on screen,
   * so it says what a region is *for* rather than restating its label.
   */
  tourSteps: [
    {
      title: 'Data layers',
      body:
        'Turn the modelled layers on and off. Biomass, wildfire hazard and ' +
        'priority thinning each colour the map a different way.',
    },
    {
      title: 'Burial depth',
      body:
        'The map shows where burial needs at most this much cover. Drag the ' +
        'handle to hide the places that need more.',
    },
    {
      title: 'The map',
      body:
        'Hover a county to see its depth at a glance, or click one to load it ' +
        'into the panel on the right.',
    },
    {
      title: 'Search further',
      body:
        'County statistics reports what one county holds. Best burial site ' +
        'searches outward from a point you choose for the shallowest ' +
        'reasonable burial or BECCS facility.',
    },
  ],
  documentTitle: 'Biomass burial siting tool · Carbon Containment Lab',

  gate:
    'This tool is built for a larger screen. Open it on a computer to explore ' +
    'burial siting across the western United States.',

  showLayersPanel: 'Show layers panel',
  collapseLayersPanel: 'Collapse layers panel',
  showQueryPanel: 'Show query panel',
  collapseQueryPanel: 'Collapse query panel',

  /* ---- Layers ---------------------------------------------------------- */
  layersHeading: 'Layers',
  layerNames: {
    depth: 'Burial depth',
    biomass: 'Biomass by county',
    whp: 'Wildfire hazard potential',
    thinning: 'USFS priority thinning',
    beccs: 'BECCS facilities',
  },
  biomassMetricLabel: 'Colour counties by',
  biomassMetricOptions: {
    acres: 'Acres for treatment',
    bdmt: 'Bone dry metric tons',
  },
  beccsScenarioLabel: 'Removal scenario',
  beccsScenarioOption: (pct: number) => `${pct}% removal`,
  beccsGloss:
    'Bioenergy with carbon capture and storage, as modeled by the Biofuel ' +
    'Infrastructure, Logistics, and Transportation (BILT) model, as cited in ' +
    'Roads to Removal (2023).',
  thinningNote: 'Federally designated priority treatment areas. Reference layer.',

  soilColumnHeading: 'Burial depth',
  soilColumnCaption: 'Minimum required soil cover depth.',
  soilColumnHelp:
    'Only areas where required cover depth is at or below this value are shown.',
  soilColumnAria: 'Maximum displayed soil cover, in metres',
  soilColumnAnnounce: (metres: string) => `Maximum displayed cover ${metres}`,

  whpLegendHeading: 'Hazard class',

  /* ---- Query panel ----------------------------------------------------- */
  tabCounty: 'County statistics',
  tabSite: 'Best burial site',

  countyIntro:
    'Look up modeled burial depth and biomass availability for one county and ' +
    'one accessibility class.',
  /** Gloss on first appearance, per 03 §14. */
  accessibilityGloss:
    'Accessibility class is how reachable the biomass is — its distance from a ' +
    'road paired with the slope of the ground.',

  labelState: 'State',
  labelCounty: 'County',
  labelRoad: 'Distance to road',
  labelSlope: 'Slope',

  placeholderState: 'Select a state…',
  placeholderCounty: 'Select a county…',
  placeholderCountyLocked: 'Select a state first',
  placeholderRoad: 'Select a class…',

  slopeOptions: ['< 20%', '20–40%'] as const,
  slopeNote:
    'Slopes over 40% and distances beyond 0.5 mi are excluded from the ' +
    'underlying model.',

  notInResidueModel: 'Not selected as highest priority treatment area',
  countyNotModelled: 'This county is not in the residue model.',

  resultsHeading: 'Results',
  minDepth: 'Min depth',
  medianDepth: 'Median depth',
  biomassAvailable: 'Biomass available',
  estimatedDryTons: 'Estimated dry tons',
  forestryTreatment: 'Forestry treatment',
  burialNetIncome: 'Burial pathway net income',
  accessibilityClass: 'Accessibility class',
  /** Gloss on first appearance, per 03 §14. */
  tco2eGloss: 'tCO₂e is tonnes of CO₂-equivalent.',
  zoomToCounty: 'Zoom to county',

  countyEmpty: 'Choose a state, county, distance class and slope to see results.',
  countyDepthUnavailable: 'No 1 km depth pixel falls inside this county.',

  siteIntro: 'Enter a point of origin to find the shallowest feasible burial site nearby.',
  labelLatitude: 'Latitude',
  labelLongitude: 'Longitude',
  latPlaceholder: '44.05',
  lngPlaceholder: '-116.10',
  pickIdle: 'Or pick a point on the map',
  pickActive: 'Click anywhere on the map…',
  labelRadius: 'Search radius',
  radiusOption: (miles: number) => `${miles} miles`,
  compareBeccs: 'Compare to nearest BECCS facility',
  findSite: 'Find best burial site',
  searching: 'Searching…',

  siteResultHeading: 'Best burial site',
  siteFeasible: 'Feasible',
  requiredCover: 'Required cover',
  straightLineDistance: 'Straight-line distance',
  coordinates: 'Coordinates',
  county: 'County',

  siteEmptyNeverSearched:
    'Click the map or enter coordinates to find the nearest feasible burial site.',
  siteEmptyNoResult: (radiusMi: number, maxDepth: string) =>
    `No site within ${radiusMi} miles at ${maxDepth} or shallower. Try a wider ` +
    'radius or a greater depth.',
  siteInvalidPoint: 'Enter a latitude between 31 and 49 and a longitude between −125 and −102.',
  siteError: 'The site search did not finish. Try again.',

  beccsResultHeading: 'Nearest BECCS facility',
  beccsScenarioEyebrow: (pct: number) => `${pct}% scenario`,
  beccsPlantType: 'Plant type',
  beccsForestryShare: 'Forestry share of feedstock',
  beccsNoneInRange: (radiusMi: number, scenarioPct: number) =>
    `No modeled BECCS facility within ${radiusMi} miles of this point under the ` +
    `${scenarioPct}% removal scenario. Coverage is sparse at this scenario; try ` +
    'a larger radius.',

  /* ---- Map ------------------------------------------------------------- */
  mapSummary:
    'Map of modeled minimum required soil cover across eleven western states. ' +
    'The panels either side carry the same figures as text.',
  beccsTooltipHeading: 'Modeled BECCS facility',
  beccsCdr: 'Carbon removal',
  beccsCost: 'Cost',
  countyHoverAcres: 'Acres for treatment',
  countyHoverBdmt: 'Bone-dry tonnes',
  countyHoverDepth: 'Median depth',
  countyHoverWhp: 'Wildfire hazard potential',

  /* ---- Loading and failure -------------------------------------------- */
  loading: 'Loading map layers…',
  retry: 'Retry',
  blockingErrorTitle: 'Map data did not load',
  blockingErrorBody:
    'The tool could not reach its data files. Nothing on this page is a live ' +
    'service, so a reload usually fixes it.',
  layerFailed: {
    whp: "Couldn't load fire risk data. Try reloading.",
    thinning: "Couldn't load thinning areas. Try reloading.",
    biomass: "Couldn't load county biomass. Try reloading.",
    beccs: "Couldn't load BECCS facilities. Try reloading.",
    depth: "Couldn't load the depth surface. Try reloading.",
    sites: "Couldn't load the site index, so site search is unavailable. Try reloading.",
  },
  countiesFailedNote: 'County outlines did not load. Depth and terrain still work.',
  siteSearchUnavailable:
    'Site search needs distances in EPSG:5070 and this build shipped a ' +
    'different projection. The county statistics tab is unaffected.',
} as const;

/**
 * The one caption that is not authored here: it comes from
 * `county_stats.json → meta.depth_scope`, so a v2 that computes depth per
 * accessibility class changes the sentence without a code change (01 §5,
 * Stage 03).
 */
export function depthScopeCaption(scope: string): string {
  return `Depth figures are for the ${scope}, not the selected accessibility class.`;
}
