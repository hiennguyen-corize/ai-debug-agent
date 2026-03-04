/**
 * Framework detector — inspects DOM and network signals to identify frontend framework.
 * Called by Scout after page load.
 */

type FrameworkDetection = {
  id: string;
  confidence: number;
  markers: string[];
};

type DetectionInput = {
  domContent: string;
  networkUrls: string[];
};

const FRAMEWORK_MARKERS: Record<string, { dom: string[]; network: string[] }> = {
  react: {
    dom: ['_reactRootContainer', 'data-reactroot', '__REACT_DEVTOOLS', 'data-reactid'],
    network: ['react-dom', 'react.production'],
  },
  nextjs: {
    dom: ['__NEXT_DATA__', '__next', 'next-route-announcer'],
    network: ['_next/static', '_next/data', '_next/image'],
  },
  vue: {
    dom: ['__VUE__', '__vue_app__', 'data-v-', 'v-cloak'],
    network: ['vue.runtime', 'vue.global'],
  },
  angular: {
    dom: ['ng-version', '_nghost', '_ngcontent', 'ng-star-inserted'],
    network: ['@angular', 'polyfills.js', 'main.js'],
  },
  svelte: {
    dom: ['__svelte', 'svelte-'],
    network: ['svelte', '.svelte-kit'],
  },
};

export const detectFrameworks = (input: DetectionInput): FrameworkDetection[] => {
  const results: FrameworkDetection[] = [];
  const domLower = input.domContent.toLowerCase();
  const urlsJoined = input.networkUrls.join(' ').toLowerCase();

  for (const [id, markers] of Object.entries(FRAMEWORK_MARKERS)) {
    const matched: string[] = [];

    for (const m of markers.dom) {
      if (domLower.includes(m.toLowerCase())) matched.push(m);
    }
    for (const m of markers.network) {
      if (urlsJoined.includes(m.toLowerCase())) matched.push(m);
    }

    if (matched.length === 0) continue;

    const total = markers.dom.length + markers.network.length;
    results.push({ id, confidence: matched.length / total, markers: matched });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
};
