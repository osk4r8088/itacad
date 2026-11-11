import type { ComponentType, LazyExoticComponent } from 'react';
import type { Exchange } from './schema';

/**
 * One entry of a section (tools, learning content). The start page and the section
 * pages render from these lists, so adding an entry needs no new page code.
 */
export interface HubEntry {
  id: string;
  title: string;
  summary: string;
  /** Planned entries are shown greyed out and link to their issue. */
  status: 'ready' | 'planned';
  /** For tools: a practical utility for real tasks, or an interactive model to understand something. */
  purpose?: 'use' | 'understand';
  /** GitHub issue that tracks the entry. */
  issue?: number;
  /** Loaded when the entry is opened. A ready entry has either a component or an exchange. */
  component?: LazyExoticComponent<ComponentType>;
  /** A lesson that is a step-by-step exchange, shown on the exchange page with its own route. */
  exchange?: () => Promise<Exchange>;
}

/** Name of the site, used in the header and page titles. */
export const SITE_NAME = 'ITACAD';

export const REPO_URL = 'https://github.com/osk4r8088/itacad';
export const ISSUES_URL = `${REPO_URL}/issues`;

/** Page title in the browser tab: "Topic | ITACAD", or the site name alone. */
export const pageTitle = (title?: string) => (title ? `${title} | ${SITE_NAME}` : SITE_NAME);
