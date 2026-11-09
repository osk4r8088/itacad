import type { ComponentType, LazyExoticComponent } from 'react';

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
  /** GitHub issue that tracks the entry. */
  issue?: number;
  /** Loaded when the entry is opened. Required when status is 'ready'. */
  component?: LazyExoticComponent<ComponentType>;
}

export const ISSUES_URL = 'https://github.com/osk4r8088/netkit-webvisualizer/issues';
