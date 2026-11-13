import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Diagrams and interactive pieces that topics and categories can show by id.
 * A new piece is a small component registered here; topics refer to it from their data.
 */
export const FIGURES: Record<string, LazyExoticComponent<ComponentType>> = {
  latency: lazy(() => import('./LatencyScale')),
  computer: lazy(() => import('./ComputerDiagram')),
  'kernel-boundary': lazy(() => import('./KernelBoundary')),
  'container-stacks': lazy(() => import('./ContainerStacks')),
  'utf8-encoder': lazy(() => import('./Utf8Encoder')),
  'source-to-program': lazy(() => import('./SourceToProgram')),
};
