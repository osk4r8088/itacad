import type { ReactNode } from 'react';

/** Back and Next for figures that step through something; `children` goes between the two buttons. */
export default function StepButtons({ value, min = 0, max, onChange, children }: { value: number; min?: number; max: number; onChange: (v: number) => void; children?: ReactNode }) {
  return (
    <div className="fig-step">
      <button type="button" className="chip" onClick={() => onChange(value - 1)} disabled={value <= min}>
        Back
      </button>
      {children}
      <button type="button" className="chip" onClick={() => onChange(value + 1)} disabled={value >= max}>
        Next
      </button>
    </div>
  );
}
