import React from 'react';
import { CutoutText } from '../../ui/CutoutText';
import { useTheme } from '../useTheme';

/*
  P5 screens open with one giant cut-out word in the top-left corner over a diagonal
  red band (LOAD, PERSONA, TUTORIAL, COMMAND). Every tab gets that word here, under the
  Persona theme only; the standard theme renders nothing, so the DOM stays as it was.
*/

export const ScreenTitle: React.FC<{ num?: number; label: string; sub?: string }> = ({ num, label, sub }) => {
  const [theme] = useTheme();
  if (theme !== 'persona') return null;
  return (
    <div className="du-screen-title relative mb-6 select-none" aria-hidden="true">
      <span className="du-screen-band" />
      <div className="relative flex items-end gap-3">
        {num ? <span className="du-screen-num">{num}</span> : null}
        <h2 className="du-screen-word m-0">
          <CutoutText text={label} />
        </h2>
      </div>
      {sub && <div className="du-screen-sub relative">{sub}</div>}
    </div>
  );
};
